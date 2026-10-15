// SPDX-License-Identifier: AGPL-3.0-or-later

//! Read-only helpers for walking through a university portal the user signed in to.
//!
//! The portal window has no capability, so the university pages cannot talk to the app. While a
//! walk-through is active every browser request that could change something is refused; the only
//! exception is a small budget of menu requests to the portal's `index.pl` (PRIMUSS opens its
//! sections that way) that the walk-through grants one click at a time.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::time::Duration;
use tauri::Manager;

static CRAWL_ACTIVE: AtomicBool = AtomicBool::new(false);
static MENU_BUDGET: AtomicU32 = AtomicU32::new(0);
const MAX_MENU_BUDGET: u32 = 3;
const MAX_SNAPSHOT_CHARS: usize = 3_000_000;
const PORTALS: [&str; 2] = ["mycampus", "primuss"];
/// The already-existing `outlook.office.com` window (`open_university_mail` in main.rs) reuses
/// this read-only crawl machinery under its own window label, not the `portal-login-{name}`
/// pattern the other two portals use.
const MAIL_PORTAL: &str = "mail";
const MAIL_WINDOW_LABEL: &str = "university-mail";

const SNAPSHOT_SCRIPT: &str = "JSON.stringify({ url: location.href, title: document.title, html: document.documentElement.outerHTML.slice(0, 3000000) })";

const STATUS_SCRIPT: &str = r#"JSON.stringify({
  url: location.href,
  ready: document.readyState,
  textLength: ((document.body && document.body.innerText) || '').length,
  hasPassword: !!document.querySelector('input[type=password]')
})"#;

// Mail scanning only exposes rows inside a message list. Other portals retain their
// existing navigation selectors and never gain permission to click arbitrary rows.
const LINKS_SCRIPT: &str = r#"(() => {
  const mail = __UNIOS_MAIL_WINDOW__;
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const nodes = Array.from(document.querySelectorAll(
    mail ? '[role="listbox"] [role="option"], [role="grid"] [role="row"]'
      : 'a[href], a[onclick], [role="link"], [role="tab"], [role="menuitem"]')).slice(0, 600);
  const links = nodes.map((el, index) => {
    const role = el.getAttribute('role');
    const messageRow = mail && ['option', 'row'].includes(role)
      && !!el.closest('[role="listbox"], [role="grid"]') && !el.querySelector('[role="columnheader"]');
    el.setAttribute('data-unios-idx', String(index));
    const box = el.getBoundingClientRect();
    let href = '';
    try {
      const raw = el.tagName === 'A' ? el.getAttribute('href') : null;
      href = raw ? new URL(raw, location.href).href : '';
    } catch (error) { href = ''; }
    return {
      index, role, messageRow,
      text: clean(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')),
      href,
      visible: box.width > 0 && box.height > 0,
    };
  });
  return JSON.stringify({ url: location.href, links });
})()"#;

/// Scrolls the most-scrollable visible container (a heuristic: largest hidden overflow) by its
/// own height. Virtualised lists like OWA's message list render only what is visible and load
/// more as their own container scrolls; `window.scrollBy` alone would not reach that container.
const SCROLL_SCRIPT: &str = r#"(() => {
  let best = document.scrollingElement, slack = 0;
  for (const el of document.querySelectorAll('*')) {
    const room = el.scrollHeight - el.clientHeight;
    if (room > slack && getComputedStyle(el).overflowY !== 'visible') { best = el; slack = room; }
  }
  if (!best || slack < 10) return JSON.stringify({ scrolled: false });
  const before = best.scrollTop;
  best.scrollTop += Math.max(200, best.clientHeight * 0.9);
  return JSON.stringify({ scrolled: best.scrollTop !== before });
})()"#;

fn portal_window(app: &tauri::AppHandle, portal: &str) -> Result<tauri::WebviewWindow, String> {
    let label = if portal == MAIL_PORTAL {
        MAIL_WINDOW_LABEL.to_string()
    } else if PORTALS.contains(&portal) {
        format!("portal-login-{portal}")
    } else {
        return Err("Unknown portal".into());
    };
    app.get_webview_window(&label)
        .ok_or_else(|| "The sign-in window is not open".to_string())
}

/// Runs a script through Tauri's callback API on WKWebView, WebView2 and WebKitGTK.
/// Only fixed, first-party inspection scripts are accepted by the commands below.
async fn run_script(window: &tauri::WebviewWindow, script: String) -> Result<String, String> {
    let (sender, receiver) = std::sync::mpsc::channel::<String>();
    window
        .eval_with_callback(script, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|_| "The page could not be read".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(Duration::from_secs(20))
            .map_err(|_| "The page did not answer in time".to_string())
    })
    .await
    .map_err(|_| "The page could not be read".to_string())?
}

/// Snapshot inspection is available everywhere. Traversal requires a native request guard.
#[tauri::command]
pub fn portal_capture_capabilities() -> serde_json::Value {
    serde_json::json!({ "traversal": cfg!(windows) })
}

/// Scripts return JSON text; Tauri wraps that in another JSON string.
pub(crate) async fn run_json(
    window: &tauri::WebviewWindow,
    script: &str,
) -> Result<serde_json::Value, String> {
    let raw = run_script(window, script.to_string()).await?;
    let text: String = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    if text.len() > MAX_SNAPSHOT_CHARS * 2 {
        return Err("The page is too large".into());
    }
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

/// The page currently shown in the portal window (address, title and rendered HTML).
#[tauri::command]
pub async fn snapshot_portal_page(
    app: tauri::AppHandle,
    portal: String,
) -> Result<serde_json::Value, String> {
    let window = portal_window(&app, &portal)?;
    let status = run_json(&window, STATUS_SCRIPT).await?;
    if status["hasPassword"].as_bool() != Some(false) {
        return Err("login-required".into());
    }
    run_json(&window, SNAPSHOT_SCRIPT).await
}

/// Address, load state and text size of the open page, so a walk-through knows when it settled.
#[tauri::command]
pub async fn portal_status(
    app: tauri::AppHandle,
    portal: String,
) -> Result<serde_json::Value, String> {
    run_json(&portal_window(&app, &portal)?, STATUS_SCRIPT).await
}

/// Links and menu entries of the open page, numbered so one of them can be clicked afterwards.
#[tauri::command]
pub async fn portal_links(
    app: tauri::AppHandle,
    portal: String,
) -> Result<serde_json::Value, String> {
    let script = LINKS_SCRIPT.replace("__UNIOS_MAIL_WINDOW__", if portal == MAIL_PORTAL { "true" } else { "false" });
    run_json(&portal_window(&app, &portal)?, &script).await
}

/// Opens an address on the portal's own host in the sign-in window (a plain GET).
#[tauri::command]
pub async fn portal_navigate(
    app: tauri::AppHandle,
    portal: String,
    url: String,
) -> Result<(), String> {
    require_traversal()?;
    let window = portal_window(&app, &portal)?;
    let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    let current = window.url().map_err(|error| error.to_string())?;
    if !same_portal_host(&current, &target) {
        return Err("Only pages of the portal itself can be opened".into());
    }
    window.navigate(target).map_err(|error| error.to_string())
}

/// Clicks a link or menu entry found by `portal_links`; the label must still match, so a page
/// that changed in the meantime is never clicked blindly. Buttons are never clicked.
#[tauri::command]
pub async fn portal_click(
    app: tauri::AppHandle,
    portal: String,
    index: u32,
    expected_text: String,
) -> Result<bool, String> {
    require_traversal()?;
    let window = portal_window(&app, &portal)?;
    let expected = serde_json::to_string(&expected_text).map_err(|error| error.to_string())?;
    let is_mail = portal == MAIL_PORTAL;
    let script = format!(
        r#"(() => {{
  const el = document.querySelector('[data-unios-idx="{index}"]');
  if (!el) return JSON.stringify({{ ok: false }});
  const role = el.getAttribute('role');
  const allowed = {is_mail}
    ? ['option', 'row'].includes(role) && !!el.closest('[role="listbox"], [role="grid"]')
      && !el.querySelector('[role="columnheader"]')
    : el.tagName === 'A' || ['link', 'tab', 'menuitem'].includes(role);
  const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!allowed || text !== {expected}) return JSON.stringify({{ ok: false }});
  el.click();
  return JSON.stringify({{ ok: true }});
}})()"#
    );
    let outcome = run_json(&window, &script).await?;
    Ok(outcome["ok"].as_bool().unwrap_or(false))
}

/// Scrolls the portal window's own most-scrollable container, for virtualised lists (OWA's
/// message list) that render more rows only once their container actually scrolls.
#[tauri::command]
pub async fn portal_scroll(app: tauri::AppHandle, portal: String) -> Result<bool, String> {
    require_traversal()?;
    let window = portal_window(&app, &portal)?;
    let outcome = run_json(&window, SCROLL_SCRIPT).await?;
    Ok(outcome["scrolled"].as_bool().unwrap_or(false))
}

/// Switches the read-only mode of the portal window on or off. While it is on, every request
/// that is not a plain read is refused, except up to `menu_budget` menu requests.
#[tauri::command]
pub async fn portal_guard(active: bool, menu_budget: u32) -> Result<(), String> {
    if active {
        require_traversal()?;
    }
    MENU_BUDGET.store(menu_budget.min(MAX_MENU_BUDGET), Ordering::SeqCst);
    CRAWL_ACTIVE.store(active, Ordering::SeqCst);
    Ok(())
}

fn require_traversal() -> Result<(), String> {
    if cfg!(windows) {
        Ok(())
    } else {
        Err("Only the page the user opened can be captured on this platform".into())
    }
}

fn same_portal_host(current: &tauri::Url, target: &tauri::Url) -> bool {
    target.scheme() == "https"
        && target.username().is_empty()
        && target.password().is_none()
        && target.host_str().is_some()
        && target.host_str() == current.host_str()
}

/// Whether a request may pass while the window is read-only. Reads always pass; a POST passes
/// only as one of the granted menu requests to the portal's `index.pl`.
fn request_allowed(method: &str, url: &str, budget: &AtomicU32) -> bool {
    if matches!(
        method.to_ascii_uppercase().as_str(),
        "GET" | "HEAD" | "OPTIONS"
    ) {
        return true;
    }
    let is_menu = method.eq_ignore_ascii_case("POST")
        && tauri::Url::parse(url)
            .map(|parsed| parsed.scheme() == "https" && parsed.path().ends_with("/index.pl"))
            .unwrap_or(false);
    is_menu
        && budget
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                left.checked_sub(1)
            })
            .is_ok()
}

/// Refuses writes from the portal window while a walk-through is active.
#[cfg(windows)]
pub fn install_request_guard(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|platform| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
        use webview2_com::{take_pwstr, WebResourceRequestedEventHandler};
        use windows::core::{HSTRING, PWSTR};

        let Ok(core) = platform.controller().CoreWebView2() else {
            return;
        };
        let environment = platform.environment();
        if core
            .AddWebResourceRequestedFilter(
                &HSTRING::from("*"),
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            )
            .is_err()
        {
            return;
        }
        let mut token = Default::default();
        let _ = core.add_WebResourceRequested(
            &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                if !CRAWL_ACTIVE.load(Ordering::SeqCst) {
                    return Ok(());
                }
                let request = args.Request()?;
                let mut method = PWSTR::null();
                request.Method(&mut method)?;
                let mut uri = PWSTR::null();
                request.Uri(&mut uri)?;
                if request_allowed(&take_pwstr(method), &take_pwstr(uri), &MENU_BUDGET) {
                    return Ok(());
                }
                let response = environment.CreateWebResourceResponse(
                    None,
                    403,
                    &HSTRING::from("Blocked: UniOS reads only"),
                    &HSTRING::from(""),
                )?;
                args.SetResponse(&response)
            })),
            &mut token,
        );
    });
}

#[cfg(not(windows))]
pub fn install_request_guard(_window: &tauri::WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_always_pass_and_writes_never_do_without_budget() {
        let none = AtomicU32::new(0);
        assert!(request_allowed("GET", "https://portal.example/a", &none));
        assert!(request_allowed("head", "https://portal.example/a", &none));
        assert!(!request_allowed(
            "POST",
            "https://portal.example/cgi-bin/index.pl",
            &none
        ));
        assert!(!request_allowed("PUT", "https://portal.example/x", &none));
        assert!(!request_allowed(
            "DELETE",
            "https://portal.example/x",
            &none
        ));
    }

    #[test]
    fn a_menu_budget_allows_exactly_that_many_index_posts() {
        let budget = AtomicU32::new(1);
        assert!(!request_allowed(
            "POST",
            "https://portal.example/api/save",
            &budget
        ));
        assert_eq!(budget.load(Ordering::SeqCst), 1);
        assert!(!request_allowed(
            "POST",
            "http://portal.example/cgi-bin/index.pl",
            &budget
        ));
        assert!(request_allowed(
            "POST",
            "https://portal.example/cgi-bin/index.pl",
            &budget
        ));
        assert!(!request_allowed(
            "POST",
            "https://portal.example/cgi-bin/index.pl",
            &budget
        ));
    }

    #[test]
    fn navigation_stays_on_the_portal_host() {
        let current = tauri::Url::parse("https://www3.primuss.de/cgi-bin/index.pl?a=1").unwrap();
        let same = |url: &str| same_portal_host(&current, &tauri::Url::parse(url).unwrap());
        assert!(same("https://www3.primuss.de/stud/x"));
        assert!(!same("https://evil.example/stud/x"));
        assert!(!same("http://www3.primuss.de/stud/x"));
        assert!(!same("https://user:pw@www3.primuss.de/x"));
    }
}
