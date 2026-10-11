//! Desktop integration: tray icon, close-to-tray, the global quick-search
//! shortcut and auto-type.
//!
//! Preferences live in the encrypted vault, so the frontend pushes them here with
//! `shell_configure` (also before unlock, from its local mirror).

use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const TRAY_ID: &str = "main";
pub const EVENT_QUICK_SEARCH: &str = "shell://quick-search";
pub const EVENT_LOCK: &str = "shell://lock";

#[derive(Default)]
pub struct ShellState {
    close_to_tray: AtomicBool,
    shortcut: Mutex<Option<Shortcut>>,
    /// Window that was in front when the global shortcut fired; auto-type returns to it.
    previous_window: AtomicIsize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Labels {
    open: String,
    search: String,
    lock: String,
    quit: String,
}

impl Default for Labels {
    fn default() -> Self {
        Self { open: "Open Keyra".into(), search: "Quick search".into(), lock: "Lock".into(), quit: "Quit".into() }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellConfig {
    close_to_tray: bool,
    /// Accelerator such as "CommandOrControl+Shift+Space"; empty turns it off.
    shortcut: String,
    labels: Labels,
}

fn menu<R: Runtime>(app: &AppHandle<R>, labels: &Labels) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", &labels.open, true, None::<&str>)?,
            &MenuItem::with_id(app, "search", &labels.search, true, None::<&str>)?,
            &MenuItem::with_id(app, "lock", &labels.lock, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?,
        ],
    )
}

pub(crate) fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn quick_search<R: Runtime>(app: &AppHandle<R>) {
    let own = app.get_webview_window("main").map(|w| platform::window_handle(&w)).unwrap_or(0);
    let front = platform::foreground_window();
    if front != 0 && front != own {
        app.state::<ShellState>().previous_window.store(front, Ordering::SeqCst);
    }
    show_main(app);
    let _ = app.emit(EVENT_QUICK_SEARCH, ());
}

pub fn shortcut_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                quick_search(app);
            }
        })
        .build()
}

/// Creates the tray icon. Called from the app's setup hook.
pub fn setup<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let handle = app.handle();
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Keyra")
        .menu(&menu(handle, &Labels::default())?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "search" => quick_search(app),
            "lock" => {
                let _ = app.emit(EVENT_LOCK, ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Keeps the app running in the tray when the window is closed (if enabled).
pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        if window.app_handle().state::<ShellState>().close_to_tray.load(Ordering::SeqCst) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

#[tauri::command]
pub fn shell_configure(app: AppHandle, state: State<ShellState>, config: ShellConfig) -> Result<(), String> {
    state.close_to_tray.store(config.close_to_tray, Ordering::SeqCst);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu(&app, &config.labels).map_err(|e| e.to_string())?));
    }

    let wanted = if config.shortcut.is_empty() {
        None
    } else {
        Some(config.shortcut.parse::<Shortcut>().map_err(|_| "shortcut_invalid")?)
    };
    let mut current = state.shortcut.lock().unwrap();
    if *current == wanted {
        return Ok(());
    }
    let gs = app.global_shortcut();
    if let Some(old) = current.take() {
        let _ = gs.unregister(old);
    }
    if let Some(s) = wanted {
        gs.register(s).map_err(|_| "shortcut_taken")?;
        *current = Some(s);
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Step {
    Text(String),
    /// "tab" or "enter".
    Key(String),
}

/// Types the steps into the window that was in front before Keyra
/// (or whatever becomes active once Keyra is minimized).
#[tauri::command]
pub async fn autotype(window: WebviewWindow, state: State<'_, ShellState>, steps: Vec<Step>) -> Result<(), String> {
    if !platform::SUPPORTED {
        return Err("autotype_unavailable".into());
    }
    let target = state.previous_window.swap(0, Ordering::SeqCst);
    let _ = window.minimize();
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(Duration::from_millis(150));
        if target != 0 {
            platform::focus(target);
        }
        std::thread::sleep(Duration::from_millis(250));
        platform::wait_for_modifiers_released(Duration::from_secs(3));
        platform::type_steps(&steps)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod platform {
    use super::Step;
    use std::time::{Duration, Instant};
    use tauri::{Runtime, WebviewWindow};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_CONTROL,
        VK_LWIN, VK_MENU, VK_RETURN, VK_RWIN, VK_SHIFT, VK_TAB,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsIconic, IsWindow, SetForegroundWindow, ShowWindow, SW_RESTORE};

    pub const SUPPORTED: bool = true;

    pub fn window_handle<R: Runtime>(w: &WebviewWindow<R>) -> isize {
        w.hwnd().map(|h| h.0 as isize).unwrap_or(0)
    }

    pub fn foreground_window() -> isize {
        unsafe { GetForegroundWindow().0 as isize }
    }

    pub fn focus(hwnd: isize) {
        let h = HWND(hwnd as _);
        unsafe {
            if !IsWindow(Some(h)).as_bool() {
                return;
            }
            if IsIconic(h).as_bool() {
                let _ = ShowWindow(h, SW_RESTORE);
            }
            let _ = SetForegroundWindow(h);
        }
    }

    /// The user may still be holding Ctrl from the shortcut that triggered auto-type.
    pub fn wait_for_modifiers_released(limit: Duration) {
        let start = Instant::now();
        let held = || [VK_CONTROL, VK_SHIFT, VK_MENU, VK_LWIN, VK_RWIN].iter().any(|k| unsafe { GetAsyncKeyState(k.0 as i32) } as u16 & 0x8000 != 0);
        while held() && start.elapsed() < limit {
            std::thread::sleep(Duration::from_millis(30));
        }
    }

    fn key(vk: VIRTUAL_KEY, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        }
    }

    fn press(vk: VIRTUAL_KEY) -> [INPUT; 2] {
        [key(vk, 0, KEYBD_EVENT_FLAGS(0)), key(vk, 0, KEYEVENTF_KEYUP)]
    }

    pub fn type_steps(steps: &[Step]) -> Result<(), String> {
        let mut inputs = Vec::new();
        for step in steps {
            match step {
                Step::Key(k) => match k.as_str() {
                    "tab" => inputs.extend(press(VK_TAB)),
                    "enter" => inputs.extend(press(VK_RETURN)),
                    _ => return Err("autotype_failed".into()),
                },
                Step::Text(text) => {
                    for ch in text.chars() {
                        match ch {
                            '\n' => inputs.extend(press(VK_RETURN)),
                            '\t' => inputs.extend(press(VK_TAB)),
                            '\r' => {}
                            _ => {
                                let mut buf = [0u16; 2];
                                for unit in ch.encode_utf16(&mut buf) {
                                    inputs.push(key(VIRTUAL_KEY(0), *unit, KEYEVENTF_UNICODE));
                                    inputs.push(key(VIRTUAL_KEY(0), *unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
                                }
                            }
                        }
                    }
                }
            }
        }
        // Send in small batches with a pause so slow web forms keep up.
        for chunk in inputs.chunks(16) {
            let sent = unsafe { SendInput(chunk, std::mem::size_of::<INPUT>() as i32) };
            if sent as usize != chunk.len() {
                return Err("autotype_failed".into());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod platform {
    use super::Step;
    use std::time::Duration;
    use tauri::{Runtime, WebviewWindow};

    pub const SUPPORTED: bool = false;
    pub fn window_handle<R: Runtime>(_w: &WebviewWindow<R>) -> isize {
        0
    }
    pub fn foreground_window() -> isize {
        0
    }
    pub fn focus(_hwnd: isize) {}
    pub fn wait_for_modifiers_released(_limit: Duration) {}
    pub fn type_steps(_steps: &[Step]) -> Result<(), String> {
        Err("autotype_unavailable".into())
    }
}
