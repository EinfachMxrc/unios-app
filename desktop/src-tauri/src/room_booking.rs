// SPDX-License-Identifier: AGPL-3.0-or-later
//! User-operated booking window and a fixed read-only availability query.
//! No exported cookies/HTML, remote IPC, click or submit API.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

const URL: &str = "https://myapps.hs-coburg.de/raumbuchung";
const LABEL: &str = "room-booking";
static CHECK_ACTIVE: AtomicBool = AtomicBool::new(false);
static CHECK_ID: AtomicU64 = AtomicU64::new(0);
static LAST_CHECK: Mutex<Option<Instant>> = Mutex::new(None);

struct CheckGuard;
impl Drop for CheckGuard {
    fn drop(&mut self) {
        CHECK_ACTIVE.store(false, Ordering::SeqCst);
    }
}

fn allowed_navigation(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && url.host_str().is_some_and(|host| {
            host == "hs-coburg.de"
                || host.ends_with(".hs-coburg.de")
                || host == "login.microsoftonline.com"
        })
}

fn booking_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    let window = app
        .get_webview_window(LABEL)
        .ok_or("booking-window-closed")?;
    let url = window.url().map_err(|_| "booking-window-closed")?;
    if url.host_str() != Some("myapps.hs-coburg.de")
        || !allowed_navigation(&url)
        || !(url.path() == "/raumbuchung" || url.path().starts_with("/raumbuchung/"))
    {
        return Err("booking-login-required".into());
    }
    Ok(window)
}

#[tauri::command]
pub async fn open_room_booking(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.show().map_err(|_| "booking-window-closed")?;
        return window
            .set_focus()
            .map_err(|_| "booking-window-closed".into());
    }
    let target = tauri::Url::parse(URL).map_err(|_| "booking-address-invalid")?;
    let popup_handle = app.clone();
    tauri::WebviewWindowBuilder::new(&app, LABEL, tauri::WebviewUrl::External(target))
        .title("Raumbuchung · Hochschule Coburg")
        .inner_size(1050.0, 800.0)
        .on_navigation(allowed_navigation)
        .on_new_window(move |target, _| {
            if allowed_navigation(&target) {
                let handle = popup_handle.clone();
                std::thread::spawn(move || {
                    if let Some(window) = handle.get_webview_window(LABEL) {
                        let _ = window.navigate(target);
                    }
                });
            }
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
        .map_err(|_| "booking-window-failed")?;
    Ok(())
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BookingSelection {
    day: String,
    persons: u32,
    start_time: String,
    duration: u32,
    room: String,
}

fn selection_valid(input: &BookingSelection) -> bool {
    // Bounds protect the bridge, not a claim about official room capacity/hours.
    let day = input.day.as_bytes();
    day.len() == 10
        && day[4] == b'-'
        && day[7] == b'-'
        && day
            .iter()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
        && input.day[0..4].parse::<i32>().ok().is_some_and(|year| {
            input.day[5..7]
                .parse::<u8>()
                .ok()
                .and_then(|month| time::Month::try_from(month).ok())
                .zip(input.day[8..10].parse::<u8>().ok())
                .is_some_and(|(month, date)| {
                    time::Date::from_calendar_date(year, month, date).is_ok()
                })
        })
        && input.persons > 0
        && input.persons <= 1000
        && (30..=180).contains(&input.duration)
        && input.duration % 30 == 0
        && (480..=1290)
            .step_by(30)
            .any(|n| input.start_time == format!("{:02}:{:02}", n / 60, n % 60))
        && [
            "", "4-030", "4-031", "4-032", "4-034", "4-035", "4-036", "4-037", "4-038", "4-039",
            "5-U11a",
        ]
        .contains(&input.room.as_str())
}

/// Set only label-associated visible fields. The user still clicks every next/booking button.
#[tauri::command]
pub async fn fill_room_booking(
    app: tauri::AppHandle,
    selection: BookingSelection,
) -> Result<serde_json::Value, String> {
    if !selection_valid(&selection) {
        return Err("booking-selection-invalid".into());
    }
    let payload = serde_json::to_string(&selection).map_err(|_| "booking-selection-invalid")?;
    let script = format!("({})({})", include_str!("room_form.js"), payload);
    crate::portal_crawl::run_json(&booking_window(&app)?, &script)
        .await
        .map_err(|_| "booking-page-unreadable".into())
}

/// Reads only the visible offer heading/message/button presence. Never reads sign-in fields.
#[tauri::command]
pub async fn read_room_booking(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    crate::portal_crawl::run_json(&booking_window(&app)?, include_str!("room_snapshot.js"))
        .await
        .map_err(|_| "booking-page-unreadable".into())
}

/// Only the HAR-verified availability GET is fetched in the user's signed-in window.
/// A synchronous start/poll protocol works on all WebViews without Promise serialization.
#[tauri::command]
pub async fn check_room_availability(
    app: tauri::AppHandle,
    selection: BookingSelection,
) -> Result<serde_json::Value, String> {
    if !selection_valid(&selection) {
        return Err("booking-selection-invalid".into());
    }
    if CHECK_ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("booking-check-busy".into());
    }
    let _guard = CheckGuard;
    // Minimum one second between requests, including callers outside the React flow.
    tauri::async_runtime::spawn_blocking(|| {
        let mut last = LAST_CHECK.lock().map_err(|_| "booking-check-busy")?;
        if let Some(previous) = *last {
            std::thread::sleep(Duration::from_secs(1).saturating_sub(previous.elapsed()));
        }
        *last = Some(Instant::now());
        Ok::<_, &str>(())
    })
    .await
    .map_err(|_| "booking-check-busy")?
    .map_err(str::to_owned)?;
    let window = booking_window(&app)?;
    let id = CHECK_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let payload = serde_json::to_string(&selection).map_err(|_| "booking-selection-invalid")?;
    let call = |mode: &str| {
        format!(
            "({})({}, {}, \"{}\")",
            include_str!("room_availability.js"),
            payload,
            id,
            mode
        )
    };
    let result = async {
        let mut result = crate::portal_crawl::run_json(&window, &call("start")).await?;
        let deadline = Instant::now() + Duration::from_secs(12);
        while result.get("status").and_then(|status| status.as_str()) == Some("pending") {
            if Instant::now() >= deadline {
                return Err("booking-check-timeout".into());
            }
            tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(100)))
                .await
                .map_err(|_| "booking-page-unreadable")?;
            booking_window(&app)?;
            result = crate::portal_crawl::run_json(&window, &call("poll")).await?;
        }
        Ok(result)
    }
    .await;
    let _ = crate::portal_crawl::run_json(&window, &call("stop")).await;
    result.map_err(|_: String| "booking-page-unreadable".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_excludes_impostors_and_unsecured_pages() {
        for url in [
            URL,
            "https://login.microsoftonline.com/test",
            "https://sso.hs-coburg.de/",
        ] {
            assert!(allowed_navigation(&tauri::Url::parse(url).unwrap()));
        }
        for url in [
            "http://myapps.hs-coburg.de/raumbuchung",
            "https://hs-coburg.de.evil.test/",
            "https://evilhs-coburg.de/",
            "https://localhost/",
            "https://user@myapps.hs-coburg.de/",
            "https://myapps.hs-coburg.de:8443/",
        ] {
            assert!(!allowed_navigation(&tauri::Url::parse(url).unwrap()));
        }
    }

    #[test]
    fn selection_rejects_arbitrary_script_inputs() {
        let mut input = BookingSelection {
            day: "2026-10-05".into(),
            persons: 2,
            start_time: "09:00".into(),
            duration: 90,
            room: "4-031".into(),
        };
        assert!(selection_valid(&input));
        input.day = "2026-02-30".into();
        assert!(!selection_valid(&input));
        input.day = "2026-10-05".into();
        input.room = "'); document.forms[0].submit(); ('".into();
        assert!(!selection_valid(&input));
    }
}
