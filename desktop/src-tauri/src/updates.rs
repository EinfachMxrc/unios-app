// SPDX-License-Identifier: AGPL-3.0-or-later
//! Fixed-channel updates. Metadata is advisory; Tauri verifies artifact and signed version.
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const MAX_MANIFEST: usize = 32768;
const ROOT: &str = "https://github.com/EinfachMxrc/unios-app/releases/download/";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Platform {
    url: String,
    signature: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: String,
    channel: String,
    min_supported_version: String,
    schema_version: String,
    compatible_schemas: Vec<String>,
    notes: Option<String>,
    pub_date: Option<String>,
    platforms: BTreeMap<String, Platform>,
}
struct Pending {
    update: Update,
    channel: String,
    manifest: Manifest,
}
#[derive(Default)]
pub struct ReleaseUpdates {
    pending: Mutex<Option<Pending>>,
    busy: AtomicBool,
}
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
#[derive(Serialize)]
pub struct UpdateReport {
    available: bool,
    version: Option<String>,
    channel: String,
    notes: Option<String>,
    schema_change: bool,
}

fn endpoint(channel: &str) -> Result<String, String> {
    if !["stable", "beta", "nightly"].contains(&channel) {
        return Err("UPDATE_UNKNOWN_CHANNEL".into());
    }
    Ok(format!("{ROOT}channel-{channel}/latest.json"))
}
fn caller(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main"
        || !window.url().is_ok_and(|url| {
            url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.port() == Some(8000)
        })
    {
        return Err("UPDATE_MAIN_WINDOW_ONLY".into());
    }
    if option_env!("UNIOS_UPDATER_PUBLIC_KEY").is_none_or(|key| key.trim().is_empty()) {
        return Err("UPDATE_UNSIGNED_BUILD".into());
    }
    if window
        .app_handle()
        .config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("requireSignedVersion"))
        != Some(&serde_json::Value::Bool(true))
    {
        return Err("UPDATE_SIGNATURE_POLICY_REQUIRED".into());
    }
    Ok(())
}
async fn bounded_json(url: &str, limit: usize) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() >= 3
                || url.scheme() != "https"
                || !["github.com", "release-assets.githubusercontent.com"]
                    .contains(&url.host_str().unwrap_or(""))
            {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|_| "UPDATE_NETWORK_UNAVAILABLE")?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "UPDATE_NETWORK_UNAVAILABLE")?;
    response_json(response, limit).await
}
async fn response_json(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<serde_json::Value, String> {
    if !response.status().is_success()
        || response.content_length().is_some_and(|n| n > limit as u64)
    {
        return Err("UPDATE_RESPONSE_INVALID".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "UPDATE_NETWORK_UNAVAILABLE")?
    {
        if bytes.len() + chunk.len() > limit {
            return Err("UPDATE_RESPONSE_TOO_LARGE".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "UPDATE_MANIFEST_INVALID".into())
}
async fn normal_mode() -> Result<(), String> {
    let value = bounded_json("http://127.0.0.1:8000/api/recovery/status", 4096).await?;
    if value.get("mode").and_then(|v| v.as_str()) != Some("normal") {
        return Err("UPDATE_NORMAL_MODE_REQUIRED".into());
    }
    Ok(())
}
fn checked_snapshot(value: &serde_json::Value, generation: u64, now: i64) -> Result<(), String> {
    let created = value
        .get("created_at")
        .and_then(|v| v.as_str())
        .filter(|s| s.len() <= 64)
        .ok_or("UPDATE_SNAPSHOT_UNVERIFIED")?;
    let date = time::OffsetDateTime::parse(created, &time::format_description::well_known::Rfc3339)
        .map_err(|_| "UPDATE_SNAPSHOT_UNVERIFIED")?;
    if value.get("status").and_then(|v| v.as_str()) != Some("ok")
        || value.get("generation").and_then(|v| v.as_u64()) != Some(generation)
        || now.abs_diff(date.unix_timestamp()) > 300
    {
        return Err("UPDATE_SNAPSHOT_UNVERIFIED".into());
    }
    Ok(())
}
async fn snapshot_before_install() -> Result<(), String> {
    normal_mode().await?;
    let host = bounded_json("http://127.0.0.1:8000/api/host", 4096).await?;
    let generation = host
        .get("generation")
        .and_then(|v| v.as_u64())
        .filter(|n| *n > 0)
        .ok_or("UPDATE_SNAPSHOT_UNVERIFIED")?;
    if host.get("mode").and_then(|v| v.as_str()) != Some("host") {
        return Err("UPDATE_SNAPSHOT_UNVERIFIED".into());
    }
    // No redirect, bearer or caller-supplied URL. The local client forwards its own
    // paired session to the VPS; the lease header prevents an ownership race.
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "UPDATE_NETWORK_UNAVAILABLE")?;
    let response = client
        .post("http://127.0.0.1:8000/api/host/snapshot")
        .header("Origin", "http://127.0.0.1:8000")
        .header("X-UniOS-Lease-Generation", generation.to_string())
        .send()
        .await
        .map_err(|_| "UPDATE_SNAPSHOT_UNVERIFIED")?;
    let value = response_json(response, MAX_MANIFEST)
        .await
        .map_err(|_| "UPDATE_SNAPSHOT_UNVERIFIED")?;
    checked_snapshot(
        &value,
        generation,
        time::OffsetDateTime::now_utc().unix_timestamp(),
    )
}
async fn diagnostics() -> Result<(String, String), String> {
    let value = bounded_json("http://127.0.0.1:8000/api/feedback/diagnostics", 16384).await?;
    let app = value
        .get("app_version")
        .and_then(|v| v.as_str())
        .ok_or("UPDATE_HEALTH_UNAVAILABLE")?;
    let schema = value
        .get("schema_version")
        .and_then(|v| v.as_str())
        .ok_or("UPDATE_HEALTH_UNAVAILABLE")?;
    if app.len() > 64 || schema.len() > 64 {
        return Err("UPDATE_HEALTH_UNAVAILABLE".into());
    }
    Ok((app.into(), schema.into()))
}
fn policy(
    raw: &serde_json::Value,
    channel: &str,
    current: &str,
    schema: &str,
) -> Result<Manifest, String> {
    if serde_json::to_vec(raw)
        .map_err(|_| "UPDATE_MANIFEST_INVALID")?
        .len()
        > MAX_MANIFEST
    {
        return Err("UPDATE_RESPONSE_TOO_LARGE".into());
    }
    let manifest: Manifest =
        serde_json::from_value(raw.clone()).map_err(|_| "UPDATE_MANIFEST_INVALID")?;
    let target = Version::parse(&manifest.version).map_err(|_| "UPDATE_MANIFEST_INVALID")?;
    let minimum =
        Version::parse(&manifest.min_supported_version).map_err(|_| "UPDATE_MANIFEST_INVALID")?;
    let running = Version::parse(current).map_err(|_| "UPDATE_MANIFEST_INVALID")?;
    if manifest.channel != channel
        || (channel == "stable" && !target.pre.is_empty())
        || minimum > target
        || running < minimum
    {
        return Err("UPDATE_VERSION_INCOMPATIBLE".into());
    }
    let valid_schema = |value: &str| {
        (8..=64).contains(&value.len())
            && value
                .bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    };
    if manifest.compatible_schemas.is_empty()
        || manifest.compatible_schemas.len() > 100
        || !valid_schema(&manifest.schema_version)
        || manifest.compatible_schemas.iter().any(|s| !valid_schema(s))
        || !manifest
            .compatible_schemas
            .contains(&manifest.schema_version)
        || !manifest.compatible_schemas.iter().any(|s| s == schema)
    {
        return Err("UPDATE_SCHEMA_INCOMPATIBLE".into());
    }
    if manifest.notes.as_ref().is_some_and(|n| n.len() > 4096)
        || manifest.pub_date.as_ref().is_some_and(|n| n.len() > 64)
        || manifest.platforms.len() != 4
    {
        return Err("UPDATE_MANIFEST_INVALID".into());
    }
    for (key, platform) in &manifest.platforms {
        if ![
            "windows-x86_64",
            "darwin-aarch64",
            "darwin-x86_64",
            "linux-x86_64",
        ]
        .contains(&key.as_str())
            || platform.signature.is_empty()
            || platform.signature.len() > 16384
        {
            return Err("UPDATE_MANIFEST_INVALID".into());
        }
        let url = tauri::Url::parse(&platform.url).map_err(|_| "UPDATE_MANIFEST_INVALID")?;
        let suffix = match key.as_str() {
            "windows-x86_64" => ".exe",
            "linux-x86_64" => ".AppImage",
            _ => ".app.tar.gz",
        };
        let expected = format!(
            "/EinfachMxrc/unios-app/releases/download/v{}/UniOS-{}-{}{suffix}",
            manifest.version, manifest.version, key
        );
        if url.scheme() != "https"
            || url.host_str() != Some("github.com")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != expected
        {
            return Err("UPDATE_ARTIFACT_NOT_ALLOWED".into());
        }
    }
    Ok(manifest)
}
fn backend_minimum(manifest: &Manifest, version: &str) -> Result<(), String> {
    let backend = Version::parse(version).map_err(|_| "UPDATE_HEALTH_UNAVAILABLE")?;
    let minimum =
        Version::parse(&manifest.min_supported_version).map_err(|_| "UPDATE_MANIFEST_INVALID")?;
    if backend < minimum {
        return Err("UPDATE_VERSION_INCOMPATIBLE".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn check_release_updates(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, ReleaseUpdates>,
    channel: String,
) -> Result<UpdateReport, String> {
    caller(&window)?;
    if state.busy.swap(true, Ordering::AcqRel) {
        return Err("UPDATE_BUSY".into());
    }
    let _busy = Busy(&state.busy);
    *state
        .pending
        .lock()
        .map_err(|_| "UPDATE_STATE_UNAVAILABLE")? = None;
    normal_mode().await?;
    let url = endpoint(&channel)?;
    let raw = bounded_json(&url, MAX_MANIFEST).await?;
    let (backend_version, schema) = diagnostics().await?;
    let current = app.package_info().version.to_string();
    let manifest = policy(&raw, &channel, &current, &schema)?;
    backend_minimum(&manifest, &backend_version)?;
    if Version::parse(&manifest.version).map_err(|_| "UPDATE_MANIFEST_INVALID")?
        <= app.package_info().version
    {
        return Ok(UpdateReport {
            available: false,
            version: None,
            channel,
            notes: None,
            schema_change: false,
        });
    }
    // Plugin 2.13 has no offline-manifest API. Its second fetch is revalidated against
    // the bounded preflight JSON; its parser itself has no response-byte cap.
    let update = app
        .updater_builder()
        .endpoints(vec![
            tauri::Url::parse(&url).map_err(|_| "UPDATE_MANIFEST_INVALID")?
        ])
        .map_err(|_| "UPDATE_CONFIGURATION_INVALID")?
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "UPDATE_CONFIGURATION_INVALID")?
        .check()
        .await
        .map_err(|_| "UPDATE_CHECK_FAILED")?
        .ok_or("UPDATE_CHECK_CHANGED")?;
    if update.raw_json != raw || update.version != manifest.version {
        return Err("UPDATE_CHECK_CHANGED".into());
    }
    let report = UpdateReport {
        available: true,
        version: Some(update.version.clone()),
        channel: channel.clone(),
        notes: manifest.notes.clone(),
        schema_change: schema != manifest.schema_version,
    };
    *state
        .pending
        .lock()
        .map_err(|_| "UPDATE_STATE_UNAVAILABLE")? = Some(Pending {
        update,
        channel,
        manifest,
    });
    Ok(report)
}

#[tauri::command]
pub async fn install_release_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, ReleaseUpdates>,
    channel: String,
    version: String,
) -> Result<(), String> {
    caller(&window)?;
    if state.busy.swap(true, Ordering::AcqRel) {
        return Err("UPDATE_BUSY".into());
    }
    let _busy = Busy(&state.busy);
    let pending = state
        .pending
        .lock()
        .map_err(|_| "UPDATE_STATE_UNAVAILABLE")?
        .take()
        .ok_or("UPDATE_CHECK_REQUIRED")?;
    if pending.channel != channel || pending.update.version != version {
        return Err("UPDATE_CHECK_CHANGED".into());
    }
    let (backend_version, schema) = diagnostics().await?;
    let checked = policy(
        &pending.update.raw_json,
        &channel,
        &app.package_info().version.to_string(),
        &schema,
    )?;
    backend_minimum(&checked, &backend_version)?;
    if pending.manifest.version != pending.update.version {
        return Err("UPDATE_CHECK_CHANGED".into());
    }
    snapshot_before_install().await?;
    let (backend_version, schema) = diagnostics().await?;
    let checked = policy(
        &pending.update.raw_json,
        &channel,
        &app.package_info().version.to_string(),
        &schema,
    )?;
    backend_minimum(&checked, &backend_version)?;
    // Signature verification AND signed-version binding are mandatory in build config.
    pending
        .update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| "UPDATE_INSTALL_FAILED")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> serde_json::Value {
        let mut platforms = serde_json::Map::new();
        for target in [
            "windows-x86_64",
            "darwin-aarch64",
            "darwin-x86_64",
            "linux-x86_64",
        ] {
            let suffix = match target {
                "windows-x86_64" => ".exe",
                "linux-x86_64" => ".AppImage",
                _ => ".app.tar.gz",
            };
            platforms.insert(target.into(), serde_json::json!({"signature":"fictional", "url":format!("{ROOT}v0.1.19/UniOS-0.1.19-{target}{suffix}")}));
        }
        serde_json::json!({"version":"0.1.19", "channel":"beta", "min_supported_version":"0.1.0", "schema_version":"ff94af768293", "compatible_schemas":["ff94af768293"], "notes":"", "platforms":platforms})
    }
    #[test]
    fn fixed_channels_and_minimum_schema_fail_closed() {
        assert!(endpoint("https://foreign.invalid").is_err());
        let mut raw = fixture();
        assert!(policy(&raw, "beta", "0.1.18", "ff94af768293").is_ok());
        let checked = policy(&raw, "beta", "0.1.18", "ff94af768293").unwrap();
        assert!(backend_minimum(&checked, "0.1.0").is_ok());
        assert!(backend_minimum(&checked, "0.0.9").is_err());
        assert!(backend_minimum(&checked, "unknown").is_err());
        assert!(policy(&raw, "stable", "0.1.18", "ff94af768293").is_err());
        assert!(policy(&raw, "beta", "0.1.18", "unknown").is_err());
        raw["min_supported_version"] = serde_json::json!("0.1.19");
        assert!(policy(&raw, "beta", "0.1.18", "ff94af768293").is_err());
    }
    #[test]
    fn artifact_redirect_source_and_extra_fields_rejected() {
        let mut raw = fixture();
        raw["platforms"]["windows-x86_64"]["url"] =
            serde_json::json!("https://foreign.invalid/setup.exe");
        assert!(policy(&raw, "beta", "0.1.18", "ff94af768293").is_err());
        let mut raw = fixture();
        raw["arbitrary"] = serde_json::json!(true);
        assert!(policy(&raw, "beta", "0.1.18", "ff94af768293").is_err());
    }
    #[test]
    fn native_snapshot_rejects_stale_unchecked_and_wrong_generation() {
        let mut raw =
            serde_json::json!({"status":"ok", "generation":7, "created_at":"2026-10-03T14:24:00Z"});
        let now = time::OffsetDateTime::parse(
            "2026-10-03T14:25:00Z",
            &time::format_description::well_known::Rfc3339,
        )
        .unwrap()
        .unix_timestamp();
        assert!(checked_snapshot(&raw, 7, now).is_ok());
        assert!(checked_snapshot(&raw, 8, now).is_err());
        assert!(checked_snapshot(&raw, 7, now + 301).is_err());
        raw["status"] = serde_json::json!("warning");
        assert!(checked_snapshot(&raw, 7, now).is_err());
        raw["status"] = serde_json::json!("ok");
        raw["created_at"] = serde_json::json!("2026-10-03");
        assert!(checked_snapshot(&raw, 7, now).is_err());
    }
}
