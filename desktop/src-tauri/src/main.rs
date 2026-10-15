// SPDX-License-Identifier: AGPL-3.0-or-later
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod portal_crawl;
mod room_booking;
mod moodle_login;
mod startup;
mod shutdown;
mod updates;
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const APP_URL: &str = "http://127.0.0.1:8000/";

/// The local service this app started, stopped again when the app quits.
struct Backend {
    child: Mutex<Option<CommandChild>>,
    running: AtomicBool,
    epoch: AtomicU64,
    restarting: AtomicBool,
}
const DESKTOP_CACHE_CLEANUP: &str = r#"
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && ['s', 'u'].includes(event.key.toLowerCase())) event.preventDefault();
});
if (location.origin === 'http://127.0.0.1:8000' && 'serviceWorker' in navigator) {
  const marker = 'unios-desktop-pwa-clean-v1';
  if (!sessionStorage.getItem(marker)) {
    sessionStorage.setItem(marker, 'done');
    Promise.all([
      navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        await Promise.all(registrations.map((registration) => registration.unregister()));
        return registrations.length;
      }),
      caches.keys().then(async (keys) => {
        await Promise.all(keys.map((key) => caches.delete(key)));
        return keys.length;
      }),
    ]).then(([registrations, keys]) => {
      if (registrations || keys) location.reload();
    });
  }
}
"#;

fn backend_ready() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 8000));
    startup::backend_ready(address)
}

fn backend_port_occupied() -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], 8000));
    TcpStream::connect_timeout(&address, Duration::from_millis(400)).is_ok()
}

fn signal_moodle_result(app: &tauri::AppHandle, detail: serde_json::Value) {
    if let Some(window) = app.get_webview_window("main") {
        // Send public state only to our page, never callbacks or tokens.
        if window.url().is_ok_and(|url| url.origin() == tauri::Url::parse(APP_URL).unwrap().origin()) {
            let _ = window.eval(&format!("window.dispatchEvent(new CustomEvent('unios-moodle-login-result', {{ detail: {detail} }}))"));
        }
        let _ = window.show();
    }
}

fn receive_moodle_callback(app: tauri::AppHandle, callback: String) {
    if callback.len() > 4096 || !callback.starts_with("marcunios://token=") {
        return;
    }
    std::thread::spawn(move || {
        signal_moodle_result(&app, serde_json::json!({ "pending": true }));
        let running = || app.try_state::<Backend>().is_some_and(|backend| backend.running.load(Ordering::Acquire));
        let ready = startup::wait_for_backend(running, backend_ready, || {}, || std::thread::sleep(Duration::from_secs(1)));
        let address = SocketAddr::from(([127, 0, 0, 1], 8000));
        let status = if ready { moodle_login::post_callback(address, &callback, running) } else { None };
        let connected = status == Some(200);
        if connected {
            if let Some(window) = app.get_webview_window(MOODLE_LOGIN_WINDOW) {
                let _ = window.destroy();
            }
        }
        let error = match status {
            Some(200) => "",
            Some(409) => "expired",
            Some(503) => "keychain",
            Some(400 | 422) => "invalid",
            _ => "service",
        };
        signal_moodle_result(&app, serde_json::json!({ "connected": connected, "error": error }));
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    });
}

fn start_backend(app: &tauri::AppHandle) -> Result<(), String> {
    start_backend_mode(app, "serve")
}

fn start_backend_mode(app: &tauri::AppHandle, mode: &str) -> Result<(), String> {
    let epoch = app.state::<Backend>().epoch.fetch_add(1, Ordering::AcqRel) + 1;
    let command = app
        .shell()
        .sidecar("uniosd")
        .map_err(|error| error.to_string())?;
    let (mut events, child) = command
        .arg(mode)
        .spawn()
        .map_err(|error| error.to_string())?;
    if let Some(backend) = app.try_state::<Backend>() {
        backend.running.store(true, Ordering::Release);
        if let Ok(mut slot) = backend.child.lock() {
            *slot = Some(child);
        }
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            // Do not forward backend output: it may contain local study context.
            if matches!(event, CommandEvent::Terminated(_)) {
                if let Some(backend) = handle.try_state::<Backend>() {
                    if backend.epoch.load(Ordering::Acquire) != epoch { continue; }
                    backend.running.store(false, Ordering::Release);
                }
                if let Some(window) = handle.get_webview_window("main") {
                    if window.url().is_ok_and(|url| url.scheme() != "http") {
                        show_error(&window, "startup");
                    }
                }
            }
        }
    });
    Ok(())
}

fn stop_backend(app: &tauri::AppHandle) {
    if let Some(backend) = app.try_state::<Backend>() {
        backend.epoch.fetch_add(1, Ordering::AcqRel);
        backend.running.store(false, Ordering::Release);
        if let Ok(mut slot) = backend.child.lock() {
            if let Some(child) = slot.take() {
                #[cfg(unix)]
                {
                    // If draining takes longer, keep the supervisor alive to
                    // finish cleanup rather than orphaning its Python worker.
                    let _ = shutdown::terminate_owned_child(child.pid());
                }
                #[cfg(not(unix))]
                let _ = child.kill();
            }
        }
    }
}

fn backend_running(app: &tauri::AppHandle) -> bool {
    app.try_state::<Backend>()
        .is_some_and(|backend| backend.running.load(Ordering::Acquire))
}

#[tauri::command]
async fn restart_backend(app: tauri::AppHandle, window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || restart_backend_blocking(app, window, mode))
        .await.map_err(|_| "RECOVERY_RESTART_FAILED".to_string())?
}

fn restart_backend_blocking(app: tauri::AppHandle, window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    if window.label() != "main" { return Err("RECOVERY_MAIN_WINDOW_ONLY".into()); }
    let argument = match mode.as_str() {
        "normal" => "serve", "safe" => "recovery", "demo" => "demo",
        _ => return Err("RECOVERY_UNKNOWN_MODE".into()),
    };
    let state = app.state::<Backend>();
    if state.restarting.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).is_err() {
        return Err("RECOVERY_ALREADY_RESTARTING".into());
    }
    struct Reset<'a>(&'a AtomicBool);
    impl Drop for Reset<'_> { fn drop(&mut self) { self.0.store(false, Ordering::Release); } }
    let _reset = Reset(&state.restarting);
    // Retire callbacks from the old child before stopping it.
    state.epoch.fetch_add(1, Ordering::AcqRel);
    stop_backend(&app);
    let port = match mode.as_str() { "demo" => 8001, "safe" => 8002, _ => 8000 };
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let occupied = || TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok();
    for _ in 0..50 {
        if !occupied() { break; }
        std::thread::sleep(Duration::from_millis(100));
    }
    if occupied() { return Err("RECOVERY_PORT_BUSY".into()); }
    start_backend_mode(&app, argument)?;
    for _ in 0..120 {
        if startup::backend_ready(address) && backend_running(&app) {
            if let Some(main) = app.get_webview_window("main") {
                main.navigate(tauri::Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap())
                    .map_err(|_| "RECOVERY_NAVIGATION_FAILED")?;
            }
            return Ok(());
        }
        if !backend_running(&app) { return Err("RECOVERY_START_FAILED".into()); }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("RECOVERY_START_TIMEOUT".into())
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Closing the window only hides it; the tray keeps UniOS reachable and quittable.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "UniOS öffnen", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "UniOS beenden", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("UniOS")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn show_error(window: &tauri::WebviewWindow, message: &str) {
    let script = match message {
        "slow" => {
            #[cfg(target_os = "macos")]
            { "document.getElementById('status').textContent = 'UniOS startet noch. Falls macOS nach einer Schlüsselbund-Freigabe fragt, bestätige sie bitte dort. Danach öffnet sich UniOS automatisch.'" }
            #[cfg(not(target_os = "macos"))]
            { "document.getElementById('status').textContent = 'UniOS startet noch. Sobald der lokale App-Dienst bereit ist, öffnet sich dein Studienplatz automatisch.'" }
        },
        "port" => "document.getElementById('status').textContent = 'UniOS kann den lokalen Port nicht verwenden. Schließe andere UniOS-Prozesse und starte die App erneut.'",
        _ => "document.getElementById('status').textContent = 'UniOS konnte nicht starten. Details stehen in logs/uniosd.log im UniOS-Datenordner. Starte die App danach erneut.'",
    };
    let _ = window.eval(script);
    let _ = window.eval("document.getElementById('recovery-actions').hidden = false");
    let _ = window.show();
}

const MOODLE_LOGIN_WINDOW: &str = "moodle-login";

/// Only Moodle's mobile launch page (the start of its app sign-in) may open in the login window.
fn is_moodle_launch_url(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path().ends_with("/admin/tool/mobile/launch.php")
}

/// Opens the official Moodle sign-in in its own window and catches the
/// `marcunios://` return link there. Browsers such as Arc drop that custom
/// scheme silently, which left the setup waiting forever. The window gets no
/// capability, so the university page cannot talk to the app.
#[tauri::command]
async fn open_moodle_login(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    if !is_moodle_launch_url(&parsed) {
        return Err("Only an official Moodle mobile sign-in link can be opened".into());
    }
    if let Some(existing) = app.get_webview_window(MOODLE_LOGIN_WINDOW) {
        existing.navigate(parsed).map_err(|error| error.to_string())?;
        existing.unminimize().map_err(|error| error.to_string())?;
        existing.show().map_err(|error| error.to_string())?;
        return existing.set_focus().map_err(|error| error.to_string());
    }
    let handle = app.clone();
    let window = tauri::WebviewWindowBuilder::new(
        &app,
        MOODLE_LOGIN_WINDOW,
        tauri::WebviewUrl::External(parsed),
    )
    .title("Moodle-Anmeldung – UniOS")
    .inner_size(960.0, 780.0)
    .on_navigation(move |target| {
        if target.scheme() != "marcunios" {
            return true;
        }
        receive_moodle_callback(handle.clone(), target.as_str().to_owned());
        false
    })
    .build()
    .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

const PORTALS: [&str; 2] = ["mycampus", "primuss"];

/// University portals may use single sign-on on other hosts, but always over HTTPS
/// and never with credentials embedded in the address.
fn is_portal_login_url(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn portal_window_label(portal: &str) -> Result<String, String> {
    if PORTALS.contains(&portal) {
        Ok(format!("portal-login-{portal}"))
    } else {
        Err("Unknown portal".into())
    }
}

/// External Outlook pages never receive the main window's IPC capabilities.
#[tauri::command]
async fn open_university_mail(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "Invalid mailbox address")?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("outlook.office.com")
        || parsed.port().is_some() || !parsed.username().is_empty() || parsed.password().is_some()
    {
        return Err("Only the official Outlook mailbox can be opened".into());
    }
    if let Some(window) = app.get_webview_window("university-mail") {
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }
    let window = tauri::WebviewWindowBuilder::new(&app, "university-mail", tauri::WebviewUrl::External(parsed))
        .title("Uni-Mail – UniOS")
        .inner_size(1200.0, 850.0)
        .on_navigation(|target| {
            // University SSO may redirect from Microsoft to its own identity provider.
            target.scheme() == "https" && target.host_str().is_some_and(|host|
                host != "localhost" && host != "127.0.0.1" && host != "[::1]")
        })
        .build()
        .map_err(|error| error.to_string())?;
    // Only takes effect once a read-only walk-through is active (portal_crawl::portal_guard);
    // normal browsing in this window is unaffected until then.
    portal_crawl::install_request_guard(&window);
    Ok(())
}

/// Opens a university portal (myCampus, PRIMUSS) for the user's own sign-in. The window gets no
/// capability, so the university pages cannot talk to the app.
#[tauri::command]
async fn open_portal_login(
    app: tauri::AppHandle,
    portal: String,
    url: String,
) -> Result<(), String> {
    let label = portal_window_label(&portal)?;
    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    if !is_portal_login_url(&parsed) {
        return Err("Only HTTPS portal links can be opened".into());
    }
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.destroy();
    }
    let popup_handle = app.clone();
    let popup_label = label.clone();
    let window =
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(parsed))
            .title(format!(
                "{} anmelden – UniOS",
                if portal == "primuss" {
                    "PRIMUSS"
                } else {
                    "myCampus"
                }
            ))
            .inner_size(1000.0, 800.0)
            .on_navigation(is_portal_login_url)
            .on_new_window(move |target, _| {
                // A portal menu that opens a new window stays inside this one, so its session is kept together.
                if is_portal_login_url(&target) {
                    let handle = popup_handle.clone();
                    let label = popup_label.clone();
                    std::thread::spawn(move || {
                        if let Some(window) = handle.get_webview_window(&label) {
                            let _ = window.navigate(target);
                        }
                    });
                }
                tauri::webview::NewWindowResponse::Deny
            })
            .build()
            .map_err(|error| error.to_string())?;
    portal_crawl::install_request_guard(&window);
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturedCookie {
    name: String,
    value: String,
    domain: String,
    path: String,
    expires: f64,
    http_only: bool,
    secure: bool,
    same_site: &'static str,
}

#[derive(serde::Serialize)]
struct PortalCapture {
    entry_url: String,
    cookies: Vec<CapturedCookie>,
}

/// Hands the sign-in the user completed in the portal window to the local page, which stores it
/// through UniOS' own API. Only the page of the main window may call this.
#[tauri::command]
async fn capture_portal_login(
    app: tauri::AppHandle,
    portal: String,
) -> Result<PortalCapture, String> {
    let label = portal_window_label(&portal)?;
    let window = app
        .get_webview_window(&label)
        .ok_or("The sign-in window is not open")?;
    let entry_url = window.url().map_err(|error| error.to_string())?.to_string();
    let cookies = window
        .cookies()
        .map_err(|error| error.to_string())?
        .into_iter()
        .filter_map(|cookie| {
            let domain = cookie.domain()?.to_owned();
            Some(CapturedCookie {
                name: cookie.name().to_owned(),
                value: cookie.value().to_owned(),
                domain,
                path: cookie.path().unwrap_or("/").to_owned(),
                expires: cookie
                    .expires_datetime()
                    .map_or(-1.0, |moment| moment.unix_timestamp() as f64),
                http_only: cookie.http_only().unwrap_or(false),
                secure: cookie.secure().unwrap_or(false),
                same_site: match cookie.same_site() {
                    Some(tauri::webview::cookie::SameSite::Strict) => "Strict",
                    Some(tauri::webview::cookie::SameSite::None) => "None",
                    _ => "Lax",
                },
            })
        })
        .collect();
    Ok(PortalCapture { entry_url, cookies })
}

#[tauri::command]
async fn close_portal_login(app: tauri::AppHandle, portal: String) -> Result<(), String> {
    let label = portal_window_label(&portal)?;
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.destroy();
    }
    Ok(())
}

/// Let the React router classify local screens; server downloads keep their
/// browser behaviour. Never load an external site's URL into the app window.
fn native_link_target(url: &tauri::Url) -> Option<String> {
    let local = tauri::Url::parse(APP_URL).ok()?;
    if url.origin() != local.origin() || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let path = url.path();
    if matches!(path, "/health" | "/api" | "/files" | "/assets")
        || ["/api/", "/files/", "/assets/"].iter().any(|prefix| path.starts_with(prefix)) {
        return None;
    }
    Some(url.to_string())
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if url.len() > 8192 {
        return Err("Link is too long".into());
    }
    let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("Only HTTP(S) links without embedded credentials can be opened".into());
    }
    if let Some(target) = native_link_target(&parsed) {
        let window = app.get_webview_window("main").ok_or("UniOS main window is unavailable")?;
        if window.url().map_err(|error| error.to_string())?.origin() != tauri::Url::parse(APP_URL).unwrap().origin() {
            return Err("UniOS is still starting".into());
        }
        let payload = serde_json::to_string(&target).map_err(|error| error.to_string())?;
        return window.eval(&format!(
            "window.dispatchEvent(new CustomEvent('unios-open-link', {{ detail: {payload} }}))"
        )).map_err(|error| error.to_string());
    }
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        let _ = app;
        let operation: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
        let target: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                target.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if (result as isize) <= 32 {
            return Err(format!(
                "Windows could not open the browser (code {})",
                result as isize
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        #[allow(deprecated)]
        app.shell()
            .open(url, None)
            .map_err(|error| error.to_string())
    }
}

fn main() {
    let background = std::env::args().any(|argument| argument == "--background");
    let mut builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }));
    if let Some(public_key) = option_env!("UNIOS_UPDATER_PUBLIC_KEY") {
        builder = builder.plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(public_key)
                .build(),
        );
    }
    builder
        .manage(updates::ReleaseUpdates::default())
        .manage(Backend {
            child: Mutex::new(None),
            running: AtomicBool::new(false),
            epoch: AtomicU64::new(0),
            restarting: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            updates::check_release_updates,
            updates::install_release_update,
            restart_backend,
            open_external_url,
            open_university_mail,
            room_booking::open_room_booking,
            room_booking::fill_room_booking,
            room_booking::read_room_booking,
            room_booking::check_room_availability,
            open_moodle_login,
            open_portal_login,
            capture_portal_login,
            portal_crawl::portal_capture_capabilities,
            portal_crawl::snapshot_portal_page,
            portal_crawl::portal_status,
            portal_crawl::portal_links,
            portal_crawl::portal_navigate,
            portal_crawl::portal_click,
            portal_crawl::portal_scroll,
            portal_crawl::portal_guard,
            close_portal_login
        ])
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(move |app| {
            let window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|config| config.label == "main")
                .ok_or("UniOS main window configuration is missing")?;
            let external_handle = app.handle().clone();
            let main_window = tauri::WebviewWindowBuilder::from_config(app, window_config)?
                .devtools(false)
                .initialization_script(DESKTOP_CACHE_CLEANUP)
                .on_permission_request(|webview, kind| {
                    let local_app = webview.url().is_ok_and(|url| {
                        url.scheme() == "http"
                            && url.host_str() == Some("127.0.0.1")
                            && matches!(url.port(), Some(8000 | 8001 | 8002))
                    });
                    if local_app && kind == PermissionKind::Microphone {
                        PermissionResponse::Allow
                    } else {
                        PermissionResponse::Default
                    }
                })
                .on_new_window(move |url, _| {
                    let handle = external_handle.clone();
                    std::thread::spawn(move || {
                        let _ = open_external_url(handle, url.to_string());
                    });
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()?;
            #[cfg(windows)]
            main_window.with_webview(|platform| unsafe {
                use windows::core::Interface;
                if let Ok(settings) = platform.controller().CoreWebView2().and_then(|core| core.Settings()) {
                    let _ = settings.SetAreDefaultContextMenusEnabled(false);
                    let _ = settings.SetAreDevToolsEnabled(false);
                    if let Ok(settings3) = settings.cast::<webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3>() {
                        let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
                    }
                }
            })?;
            // Show the start screen right away; waiting for the service would
            // leave the user with no visible window for many seconds.
            if !background {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            build_tray(app)?;
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            app.deep_link().register_all()?;
            let callback_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    receive_moodle_callback(callback_handle.clone(), url.as_str().to_owned());
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    receive_moodle_callback(app.handle().clone(), url.as_str().to_owned());
                }
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // A running server on this port might belong to an older
                // installation. Never silently attach this window to it.
                if backend_port_occupied() {
                    if let Some(window) = handle.get_webview_window("main") {
                        show_error(&window, "port");
                    }
                    return;
                }
                if start_backend(&handle).is_err() {
                    if let Some(window) = handle.get_webview_window("main") {
                        show_error(&window, "startup");
                    }
                    return;
                }
                let epoch = handle.state::<Backend>().epoch.load(Ordering::Acquire);
                let current = || backend_running(&handle) && handle.state::<Backend>().epoch.load(Ordering::Acquire) == epoch;
                let ready = startup::wait_for_backend(
                    current,
                    backend_ready,
                    || {
                        if current() {
                            if let Some(window) = handle.get_webview_window("main") {
                                show_error(&window, "slow");
                            }
                        }
                    },
                    || std::thread::sleep(Duration::from_secs(1)),
                );
                if ready && current() {
                    if let Some(window) = handle.get_webview_window("main") {
                        if let Ok(url) = tauri::Url::parse(APP_URL) {
                            let _ = window.navigate(url);
                        }
                        if !background {
                            let _ = window.show();
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("UniOS-Fenster konnte nicht erstellt werden")
        .run(|app, event| match event {
            // ExitRequested precedes the shell plugin's forced child cleanup.
            // PyInstaller's onefile supervisor needs TERM to stop its worker.
            tauri::RunEvent::ExitRequested { .. } => stop_backend(app),
            tauri::RunEvent::Exit => stop_backend(app),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_main(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn local_window_links_are_forwarded_without_opening_a_browser() {
        let link = tauri::Url::parse("http://127.0.0.1:8000/notes?course_id=1&id=fictional#section").unwrap();
        assert_eq!(super::native_link_target(&link), Some(link.to_string()));
        for url in ["https://example.org/notes", "http://127.0.0.1.example.org:8000/notes",
            "http://127.0.0.1:8173/notes", "http://user@127.0.0.1:8000/notes",
            "http://127.0.0.1:8000/api/notes", "http://127.0.0.1:8000/files/41",
            "http://127.0.0.1:8000/assets/file.js", "http://127.0.0.1:8000/health"] {
            assert_eq!(super::native_link_target(&tauri::Url::parse(url).unwrap()), None);
        }
    }

    use super::is_moodle_launch_url;

    #[test]
    fn callback_accepts_only_success_and_reads_fragmented_status() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        for status in ["200 OK", "400 Bad Request", "503 Service Unavailable"] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0_u8; 2048];
                assert!(stream.read(&mut buffer).unwrap() > 0);
                stream.write_all(b"HTTP/1.1 ").unwrap();
                std::thread::sleep(std::time::Duration::from_millis(10));
                stream.write_all(format!("{status}\r\nContent-Length: 0\r\n\r\n").as_bytes()).unwrap();
            });
            assert_eq!(super::moodle_login::post_callback(address, "marcunios://token=invented", || true), status.split_whitespace().next().unwrap().parse().ok());
            server.join().unwrap();
        }
    }

    fn check(url: &str) -> bool {
        is_moodle_launch_url(&tauri::Url::parse(url).expect("test URL"))
    }

    #[test]
    fn portal_login_needs_https_without_embedded_credentials() {
        let check =
            |url: &str| super::is_portal_login_url(&tauri::Url::parse(url).expect("test URL"));
        assert!(check("https://mycampus.example.edu/"));
        assert!(check("https://sso.example.edu/idp/login?next=x"));
        assert!(!check("http://mycampus.example.edu/"));
        assert!(!check("https://user:pw@mycampus.example.edu/"));
        assert!(!check("file:///C:/Windows/win.ini"));
        assert!(!check("javascript:alert(1)"));
    }

    #[test]
    fn only_known_portals_get_a_window() {
        assert_eq!(
            super::portal_window_label("primuss").as_deref(),
            Ok("portal-login-primuss")
        );
        assert!(super::portal_window_label("../main").is_err());
        assert!(super::portal_window_label("mail").is_err());
    }

    #[test]
    fn accepts_the_moodle_mobile_launch_page() {
        assert!(check(
            "https://moodle.example.edu/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=x"
        ));
        assert!(check(
            "https://example.edu/moodle/admin/tool/mobile/launch.php"
        ));
    }

    #[test]
    fn rejects_anything_else() {
        assert!(!check(
            "http://moodle.example.edu/admin/tool/mobile/launch.php"
        ));
        assert!(!check(
            "https://user:pw@moodle.example.edu/admin/tool/mobile/launch.php" // pragma: allowlist secret -- invented URL rejected by the validator
        ));
        assert!(!check("https://moodle.example.edu/login/index.php"));
        assert!(!check("file:///C:/admin/tool/mobile/launch.php"));
        assert!(!check("marcunios://token=abc"));
    }
}
