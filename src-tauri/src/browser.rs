//! Browser extension bridge.
//!
//! A small HTTP server on 127.0.0.1 that the Keyra browser extension talks to.
//! The vault JSON is owned by the frontend, so vault requests are forwarded to it
//! as `browser://request` events and answered through `browser_reply`.
//!
//! Security:
//! - Listens on loopback only, rejects a Host that is not loopback (DNS rebinding)
//!   and an Origin that is not a browser extension (web pages cannot call it).
//! - Every request but pairing carries a client id and a 256-bit token. A token is
//!   issued only after the user approves the pairing in the app, where the same
//!   code as in the extension is shown; only its SHA-256 is stored.
//! - While the vault is locked only `status` and `show` are answered.
//! - A pairing marked `test` is approved without a prompt only while the sample-data
//!   test account is open (decided by the frontend); otherwise it is a normal pairing.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64URL, Engine};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::vault::{self, VaultState};

pub const PORT: u16 = 47390;
const FILE_NAME: &str = "browsers.json";
const MAX_BODY: u64 = 1024 * 1024;
const REPLY_TIMEOUT: Duration = Duration::from_secs(15);
/// The user has this long to approve a pairing in the app.
const PAIR_TIMEOUT: Duration = Duration::from_secs(120);
/// `lastUsed` is written to disk at most this often per client.
const TOUCH_INTERVAL_MS: u64 = 60_000;
pub const EVENT_REQUEST: &str = "browser://request";
pub const EVENT_PAIR: &str = "browser://pair";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Client {
    id: String,
    name: String,
    /// SHA-256 of the token, base64url.
    hash: String,
    created_at: u64,
    last_used: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    id: String,
    name: String,
    created_at: u64,
    last_used: u64,
}

#[derive(Default)]
pub struct BrowserState {
    server: Mutex<Option<Arc<Server>>>,
    /// Requests waiting for the frontend's answer, by id.
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
    pairing: AtomicBool,
    /// Serializes read-modify-write of the clients file.
    file: Mutex<()>,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn random_id(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    OsRng.fill_bytes(&mut buf);
    B64URL.encode(buf)
}

fn hash_token(token: &str) -> String {
    B64URL.encode(Sha256::digest(token.as_bytes()))
}

fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn clients_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(vault::data_dir(app)?.join(FILE_NAME))
}

fn load_clients(app: &AppHandle) -> Vec<Client> {
    clients_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn store_clients(app: &AppHandle, clients: &[Client]) -> Result<(), String> {
    let json = serde_json::to_string(clients).map_err(|e| e.to_string())?;
    fs::write(clients_path(app)?, json).map_err(|e| format!("write_failed:{e}"))
}

pub(crate) fn forget(app: &AppHandle) {
    if let Ok(path) = clients_path(app) {
        let _ = fs::remove_file(path);
    }
}

fn header(req: &Request, name: &'static str) -> Option<String> {
    req.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str().to_string())
}

fn host_ok(host: Option<&str>) -> bool {
    matches!(host, Some(h) if h == format!("127.0.0.1:{PORT}") || h == format!("localhost:{PORT}"))
}

fn extension_origin(origin: &str) -> bool {
    ["chrome-extension://", "moz-extension://", "safari-web-extension://", "extension://"]
        .iter()
        .any(|p| origin.starts_with(p))
}

fn h(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

fn handle(app: &AppHandle, mut req: Request) {
    let origin = header(&req, "Origin");
    if !host_ok(header(&req, "Host").as_deref()) || origin.as_deref().is_some_and(|o| !extension_origin(o)) {
        let _ = req.respond(Response::empty(403));
        return;
    }
    // Firefox may treat host permissions as optional, which turns calls into CORS requests.
    let cors: Vec<Header> = origin
        .map(|o| vec![h("Access-Control-Allow-Origin", &o), h("Access-Control-Allow-Headers", "content-type"), h("Access-Control-Allow-Methods", "POST")])
        .unwrap_or_default();

    if *req.method() == Method::Options {
        let mut res = Response::empty(204);
        for c in cors {
            res.add_header(c);
        }
        let _ = req.respond(res);
        return;
    }
    if *req.method() != Method::Post || req.url() != "/v1" {
        let _ = req.respond(Response::empty(404));
        return;
    }

    let mut body = String::new();
    let read = req.as_reader().take(MAX_BODY).read_to_string(&mut body);
    let reply = match read.ok().and_then(|_| serde_json::from_str::<Value>(&body).ok()) {
        Some(msg) => match dispatch(app, msg) {
            Ok(result) => json!({ "ok": true, "result": result }),
            Err(error) => json!({ "ok": false, "error": error }),
        },
        None => json!({ "ok": false, "error": "bad_request" }),
    };

    let mut res = Response::from_string(reply.to_string()).with_header(h("Content-Type", "application/json"));
    for c in cors {
        res.add_header(c);
    }
    let _ = req.respond(res);
}

fn dispatch(app: &AppHandle, mut msg: Value) -> Result<Value, String> {
    let kind = msg["type"].as_str().unwrap_or("").to_string();
    if kind == "pair" {
        return pair(app, &msg);
    }
    authenticate(app, &msg)?;
    // The frontend never needs the credentials.
    if let Some(obj) = msg.as_object_mut() {
        obj.remove("client");
        obj.remove("token");
    }

    let unlocked = vault::is_unlocked(&app.state::<VaultState>());
    match kind.as_str() {
        "status" => Ok(json!({ "unlocked": unlocked, "version": env!("CARGO_PKG_VERSION") })),
        "show" => {
            crate::shell::show_main(app);
            Ok(json!({}))
        }
        _ if !unlocked => Err("locked".into()),
        _ => {
            if kind == "open" {
                crate::shell::show_main(app);
            }
            forward(app, EVENT_REQUEST, msg, REPLY_TIMEOUT)
        }
    }
}

fn authenticate(app: &AppHandle, msg: &Value) -> Result<(), String> {
    let (Some(id), Some(token)) = (msg["client"].as_str(), msg["token"].as_str()) else {
        return Err("unauthorized".into());
    };
    let state = app.state::<BrowserState>();
    let _guard = state.file.lock().unwrap();
    let mut clients = load_clients(app);
    let client = clients.iter_mut().find(|c| c.id == id).ok_or("unauthorized")?;
    if !constant_eq(client.hash.as_bytes(), hash_token(token).as_bytes()) {
        return Err("unauthorized".into());
    }
    let now = now_ms();
    if now.saturating_sub(client.last_used) > TOUCH_INTERVAL_MS {
        client.last_used = now;
        let _ = store_clients(app, &clients);
    }
    Ok(())
}

/// Asks the user to approve a new browser; on approval issues its id and token.
fn pair(app: &AppHandle, msg: &Value) -> Result<Value, String> {
    if !vault::is_unlocked(&app.state::<VaultState>()) {
        return Err("locked".into());
    }
    let name: String = msg["name"].as_str().unwrap_or("").chars().take(64).collect();
    let code: String = msg["code"].as_str().unwrap_or("").chars().take(16).collect();
    if name.trim().is_empty() || code.trim().is_empty() {
        return Err("bad_request".into());
    }

    let state = app.state::<BrowserState>();
    if state.pairing.swap(true, Ordering::SeqCst) {
        return Err("pair_busy".into());
    }
    // A test pairing is approved by the frontend without a prompt, but only while the test account is open.
    let test = msg["test"].as_bool().unwrap_or(false);
    crate::shell::show_main(app);
    let answer = forward(app, EVENT_PAIR, json!({ "name": name, "code": code, "test": test }), PAIR_TIMEOUT);
    state.pairing.store(false, Ordering::SeqCst);

    if !answer?["approved"].as_bool().unwrap_or(false) {
        return Err("pair_denied".into());
    }
    let id = random_id(12);
    let token = random_id(32);
    let now = now_ms();
    let _guard = state.file.lock().unwrap();
    let mut clients = load_clients(app);
    clients.push(Client { id: id.clone(), name, hash: hash_token(&token), created_at: now, last_used: now });
    store_clients(app, &clients)?;
    Ok(json!({ "client": id, "token": token }))
}

/// Emits `event` to the frontend and waits for its `browser_reply`.
fn forward(app: &AppHandle, event: &str, request: Value, timeout: Duration) -> Result<Value, String> {
    let state = app.state::<BrowserState>();
    let id = random_id(12);
    let (tx, rx) = mpsc::channel();
    state.pending.lock().unwrap().insert(id.clone(), tx);
    let emitted = app.emit(event, json!({ "id": id, "request": request }));
    let answer = emitted.map_err(|e| e.to_string()).and_then(|_| rx.recv_timeout(timeout).map_err(|_| "app_busy".to_string()));
    state.pending.lock().unwrap().remove(&id);

    let answer = answer?;
    match answer.get("error").and_then(Value::as_str) {
        Some(error) => Err(error.to_string()),
        None => Ok(answer.get("result").cloned().unwrap_or(Value::Null)),
    }
}

/// Starts or stops the server. Preferences live in the vault, so the frontend calls
/// this (also before unlock, from its local mirror).
#[tauri::command]
pub fn browser_configure(app: AppHandle, state: State<BrowserState>, enabled: bool) -> Result<(), String> {
    let mut server = state.server.lock().unwrap();
    if enabled == server.is_some() {
        return Ok(());
    }
    if let Some(old) = server.take() {
        old.unblock();
        return Ok(());
    }
    let s = Arc::new(Server::http(("127.0.0.1", PORT)).map_err(|_| "browser_port_taken")?);
    let worker = s.clone();
    std::thread::spawn(move || {
        for req in worker.incoming_requests() {
            let app = app.clone();
            std::thread::spawn(move || handle(&app, req));
        }
    });
    *server = Some(s);
    Ok(())
}

#[tauri::command]
pub fn browser_reply(state: State<BrowserState>, id: String, response: Value) {
    if let Some(tx) = state.pending.lock().unwrap().remove(&id) {
        let _ = tx.send(response);
    }
}

#[tauri::command]
pub fn browser_clients(app: AppHandle) -> Vec<ClientInfo> {
    load_clients(&app)
        .into_iter()
        .map(|c| ClientInfo { id: c.id, name: c.name, created_at: c.created_at, last_used: c.last_used })
        .collect()
}

#[tauri::command]
pub fn browser_revoke(app: AppHandle, state: State<BrowserState>, id: String) -> Result<(), String> {
    let _guard = state.file.lock().unwrap();
    let clients: Vec<Client> = load_clients(&app).into_iter().filter(|c| c.id != id).collect();
    store_clients(&app, &clients)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_and_host_checks() {
        assert!(extension_origin("chrome-extension://abcdef"));
        assert!(extension_origin("moz-extension://1234"));
        assert!(!extension_origin("https://evil.example"));
        assert!(!extension_origin("null"));
        assert!(host_ok(Some(&format!("127.0.0.1:{PORT}"))));
        assert!(!host_ok(Some("evil.example")));
        assert!(!host_ok(None));
    }

    #[test]
    fn token_hash_compare() {
        let token = random_id(32);
        assert!(constant_eq(hash_token(&token).as_bytes(), hash_token(&token).as_bytes()));
        assert!(!constant_eq(hash_token(&token).as_bytes(), hash_token("other").as_bytes()));
    }
}
