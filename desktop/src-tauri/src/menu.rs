//! The app menu's update items, under About CKPro as macOS apps have them:
//! Check for Updates… (the check; the interface says what it finds in a
//! toast), and the update itself, there only while there is one (restart
//! onto it, or download it by hand). Only where the app has a menu of its own
//! (`platform::APP_MENU`); the rest of the menu is the system's own. The
//! app's submenu is named for the product (`productName`) in so many
//! words: left to the system, About, Hide and Quit take the process's name,
//! the binary's (`ckpro`) when run out of a bundle.

use crate::update::{UpdateInfo, UpdateStatus, Updater};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::menu::{AboutMetadata, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Wry};
use tauri_specta::Event;

const CHECK: &str = "update-check";
const UPDATE: &str = "update-take";

/// Check for Updates… was chosen: the interface says what the check
/// finds, in a toast (not over an attempt)
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct UpdateCheckAsked;

/// Where the update item goes, under Check for Updates…
const UPDATE_AT: usize = 2;

/// The menu's update item, in the app's submenu while there is an update
struct UpdateItem {
    submenu: Submenu<Wry>,
    item: MenuItem<Wry>,
    shown: Mutex<bool>,
}

/// The system's menu, with the update items under About CKPro, the update
/// as `info` has it. Later changes come through `show`, from the updater
pub fn install(app: &AppHandle, info: &UpdateInfo) -> tauri::Result<()> {
    if !crate::platform::APP_MENU {
        return Ok(());
    }
    let menu = Menu::default(app)?;
    let name = app.package_info().name.clone();
    let check = MenuItem::with_id(app, CHECK, "Check for Updates…", true, None::<&str>)?;
    // As the update stands now: there from the start when there is one
    let now = update_item(&info.status);
    let (label, enabled) = now.clone().unwrap_or_default();
    let update = MenuItem::with_id(app, UPDATE, label, enabled, None::<&str>)?;
    let about = AboutMetadata {
        name: Some(name.clone()),
        version: Some(app.package_info().version.to_string()),
        // No build number after it: macOS would put the version again, in brackets
        short_version: Some(String::new()),
        copyright: app.config().bundle.copyright.clone(),
        // The app's own icon, a development run too (out of a bundle it has none)
        icon: app.default_window_icon().cloned(),
        ..Default::default()
    };
    let app_menu = Submenu::with_items(
        app,
        &name,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&format!("About {name}")), Some(about))?,
            &check,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&format!("Hide {name}")))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&format!("Quit {name}")))?,
        ],
    )?;
    // The system's first submenu is the app's: this one in its place
    if now.is_some() {
        app_menu.insert(&update, UPDATE_AT)?;
    }
    menu.remove_at(0)?;
    menu.insert(&app_menu, 0)?;
    app.set_menu(menu)?;
    // Managed last: the updater's changes reach the item only once it is whole
    app.manage(UpdateItem { submenu: app_menu, item: update, shown: Mutex::new(now.is_some()) });
    app.on_menu_event(chosen);
    Ok(())
}

/// The update item as `info` has it (the updater's every change): put in
/// while there is an update, taken out when there is none. The lock is held
/// while the menu changes, so changes from two threads land in order
pub fn show(app: &AppHandle, info: &UpdateInfo) {
    let Some(menu) = app.try_state::<UpdateItem>() else { return };
    let mut shown = menu.shown.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    let done = match update_item(&info.status) {
        Some((label, enabled)) => menu.item.set_text(label).and_then(|()| menu.item.set_enabled(enabled)).and_then(|()| {
            if !*shown {
                menu.submenu.insert(&menu.item, UPDATE_AT)?;
                *shown = true;
            }
            Ok(())
        }),
        None if *shown => menu.submenu.remove(&menu.item).map(|()| *shown = false),
        None => Ok(()),
    };
    if let Err(e) = done {
        tracing::warn!(error = %e, "showing the update in the menu");
    }
}

fn chosen(app: &AppHandle, event: MenuEvent) {
    let Some(updater) = app.try_state::<Arc<Updater>>().map(|u| u.inner().clone()) else { return };
    match event.id().as_ref() {
        CHECK => {
            updater.check();
            let _ = UpdateCheckAsked.emit(app);
        }
        UPDATE => match updater.state().status {
            UpdateStatus::Ready { .. } => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let preparing = app.clone();
                    // Held back (an attempt began meanwhile): the item already says by what
                    if let Err(e) = updater.restart(move || crate::prepare_restart(&preparing), move || app.request_restart()).await {
                        tracing::warn!(error = %e, "restarting onto the update from the menu");
                    }
                });
            }
            UpdateStatus::Manual { url, .. } => {
                use tauri_plugin_opener::OpenerExt as _;
                if let Err(e) = app.opener().open_url(url, None::<&str>) {
                    tracing::warn!(error = %e, "opening the release from the menu");
                }
            }
            _ => {}
        },
        _ => {}
    }
}

/// What the update item says, and whether it can be chosen; none: no
/// update, no item
fn update_item(status: &UpdateStatus) -> Option<(String, bool)> {
    Some(match status {
        UpdateStatus::Ready { version, blocked: None, .. } => (format!("Restart to Update to {version}"), true),
        UpdateStatus::Ready { version, blocked: Some(by), .. } => (format!("Update to {version} After {by}"), false),
        UpdateStatus::Manual { version, .. } => (format!("Download CKPro {version}…"), true),
        UpdateStatus::Downloading { version, .. } => (format!("Downloading {version}…"), false),
        UpdateStatus::Restarting { version } => (format!("Installing {version}…"), false),
        UpdateStatus::Idle { .. } | UpdateStatus::Checking | UpdateStatus::Failed { .. } => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_update_item_is_there_only_with_an_update() {
        let ready = |blocked: Option<&str>| UpdateStatus::Ready {
            version: "0.4.0".into(),
            notes: String::new(),
            required: false,
            blocked: blocked.map(Into::into),
            on_quit: true,
        };
        assert_eq!(update_item(&ready(None)), Some(("Restart to Update to 0.4.0".into(), true)));
        assert_eq!(update_item(&ready(Some("your exam"))), Some(("Update to 0.4.0 After your exam".into(), false)));
        let manual = UpdateStatus::Manual {
            version: "0.4.0".into(),
            notes: String::new(),
            required: false,
            reason: String::new(),
            url: "https://example.com".into(),
            command: None,
        };
        assert_eq!(update_item(&manual), Some(("Download CKPro 0.4.0…".into(), true)));
        // Nothing to take: no item
        assert_eq!(update_item(&UpdateStatus::Checking), None);
        assert_eq!(update_item(&UpdateStatus::Idle { checked_at: None }), None);
        assert_eq!(update_item(&UpdateStatus::Failed { message: String::new() }), None);
    }
}
