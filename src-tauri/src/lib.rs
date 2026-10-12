mod attachments;
mod browser;
mod hello;
mod shell;
mod vault;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch (e.g. while Keyra sits in the tray) focuses the running window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(shell::shortcut_plugin())
        .plugin(shell::autostart_plugin())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(vault::VaultState::default())
        .manage(shell::ShellState::default())
        .manage(browser::BrowserState::default())
        .setup(|app| Ok(shell::setup(app)?))
        .on_window_event(shell::on_window_event)
        .invoke_handler(tauri::generate_handler![
            vault::vault_status,
            vault::vault_create,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_save,
            vault::vault_change_password,
            vault::vault_export,
            vault::vault_import,
            vault::vault_delete,
            vault::vault_backup_auto,
            vault::read_text_file,
            hello::hello_status,
            hello::hello_enable,
            hello::hello_disable,
            hello::hello_unlock,
            attachments::attachment_add,
            attachments::attachment_save,
            attachments::attachment_delete,
            shell::shell_configure,
            shell::autotype,
            browser::browser_configure,
            browser::browser_reply,
            browser::browser_clients,
            browser::browser_revoke,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
