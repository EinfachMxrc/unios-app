// SPDX-License-Identifier: AGPL-3.0-or-later

//! Native inspection smoke test against the bundled, public start screen only.
//! Run with `cargo run --example portal_capture_smoke`; no backend or login is started.

#[path = "../src/portal_crawl.rs"]
mod portal_crawl;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;

fn main() {
    let passed = Arc::new(AtomicBool::new(false));
    let outcome = passed.clone();
    tauri::Builder::default()
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "portal-login-mycampus",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("UniOS: lokaler Erfassungstest")
            .visible(false)
            .build()?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result: Result<(), String> = async {
                    for _ in 0..40 {
                        if portal_crawl::portal_status(handle.clone(), "mycampus".into())
                            .await
                            .is_ok_and(|status| {
                                status["ready"] == "complete"
                                    && status["textLength"].as_u64().unwrap_or(0) > 40
                            })
                        {
                            break;
                        }
                        tauri::async_runtime::spawn_blocking(|| {
                            std::thread::sleep(std::time::Duration::from_millis(100))
                        })
                        .await
                        .map_err(|_| "test wait failed".to_string())?;
                    }
                    let status =
                        portal_crawl::portal_status(handle.clone(), "mycampus".into()).await?;
                    if status["hasPassword"] != false {
                        return Err("unexpected sign-in form".into());
                    }
                    let page =
                        portal_crawl::snapshot_portal_page(handle.clone(), "mycampus".into())
                            .await?;
                    if page["title"] != "UniOS startet"
                        || !page["html"]
                            .as_str()
                            .is_some_and(|html| html.contains("id=\"status\""))
                    {
                        return Err("bundled page was not captured".into());
                    }
                    let links =
                        portal_crawl::portal_links(handle.clone(), "mycampus".into()).await?;
                    if !links["links"].is_array() {
                        return Err("link inspection did not return a list".into());
                    }
                    let window = handle.get_webview_window("portal-login-mycampus").ok_or("test window missing")?;
                    window.eval("document.body.insertAdjacentHTML('beforeend', '<input type=password>')").map_err(|_| "test form could not be added")?;
                    if portal_crawl::snapshot_portal_page(handle.clone(), "mycampus".into()).await != Err("login-required".into()) {
                        return Err("password form was captured".into());
                    }
                    if portal_crawl::snapshot_portal_page(handle.clone(), "primuss".into()).await.is_ok() {
                        return Err("a closed portal window was reported as readable".into());
                    }
                    if !cfg!(windows) {
                        if portal_crawl::portal_guard("mycampus".into(), true, 1).await.is_ok()
                            || portal_crawl::portal_click(
                                handle.clone(),
                                "mycampus".into(),
                                0,
                                "save".into(),
                            )
                            .await
                            .is_ok()
                            || portal_crawl::portal_navigate(
                                handle.clone(),
                                "mycampus".into(),
                                "https://portal.example.invalid/".into(),
                            )
                            .await
                            .is_ok()
                        {
                            return Err("unguarded traversal was allowed".into());
                        }
                    }
                    Ok(())
                }
                .await;
                outcome.store(result.is_ok(), Ordering::Release);
                if let Err(error) = &result {
                    eprintln!("Local fixture inspection error: {error}");
                }
                println!(
                    "Native portal inspection: {}",
                    if result.is_ok() { "passed" } else { "failed" }
                );
                handle.exit(if result.is_ok() { 0 } else { 1 });
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("local test window could not be created")
        .run(|_, _| {});
    assert!(
        passed.load(Ordering::Acquire),
        "native portal inspection failed"
    );
}
