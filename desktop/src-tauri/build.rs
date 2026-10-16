// SPDX-License-Identifier: AGPL-3.0-or-later
fn main() {
    println!("cargo:rerun-if-env-changed=UNIOS_UPDATER_PUBLIC_KEY");
    // App commands need their own permission before the local UniOS page may
    // call them; capabilities/default.json grants only the sign-in commands.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "check_release_updates",
            "install_release_update",
            "restart_backend",
            "open_moodle_login",
            "open_external_url",
            "open_university_mail",
            "open_room_booking",
            "fill_room_booking",
            "read_room_booking",
            "check_room_availability",
            "open_portal_login",
            "capture_portal_login",
            "portal_capture_capabilities",
            "snapshot_portal_page",
            "portal_status",
            "portal_links",
            "portal_navigate",
            "portal_click",
            "portal_scroll",
            "portal_guard",
            "close_portal_login",
        ]),
    ))
    .expect("Tauri-Build fehlgeschlagen")
}
