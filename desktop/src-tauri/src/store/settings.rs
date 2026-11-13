//! The app's settings, kept as JSON values by key

use super::{Store, db, to_json};
use crate::error::AppResult;
use crate::runtime::preflight::Footprint;
use rusqlite::{OptionalExtension, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

/// The exam desk's display settings
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct Settings {
    /// How much larger the desktop is drawn (the ExamUI's +/-)
    pub desktop_zoom: f64,
    /// A fixed desktop resolution, or none to fit the panel
    pub desktop_resolution: Option<(u32, u32)>,
    /// Question text size: 0 (smaller) to 3 (larger), 1 by default
    pub question_size: u8,
    /// The task panel's share of the desk, in percent (its drag handle)
    pub task_width: f64,
    /// The assistant pane: shown, and its width in px (its drag handle)
    pub assistant_open: bool,
    pub assistant_width: u32,
    /// The assistant's model and effort, as last picked
    pub assistant_model: Option<String>,
    pub assistant_effort: Option<String>,
    /// The assistant at all: off, the app has no AI anywhere
    pub assistant_enabled: bool,
    /// Anonymous usage analytics (on unless turned off in Settings > About)
    pub analytics: bool,
    /// The sidebar folded into the floating capsule (⌃⌘S)
    pub sidebar_folded: bool,
    /// How the sidebar lists the screens and the exams
    pub sidebar: SidebarLayout,
    /// Light or dark, or as macOS is
    pub theme: Theme,
    /// The exams the candidate prepares for, and when (CKA, then CKAD…)
    pub targets: Vec<ExamTarget>,
    /// The first of `targets`, kept for an older ckpro reading these
    /// settings; read only when `targets` was never written
    pub target: Option<ExamTarget>,
    /// The certification Home and the Calendar show, or none for all of them
    pub focus: Option<String>,
    /// How Home's modules are arranged
    pub home: HomeLayout,
}

/// Home's modules as the candidate arranged them: each one's cell on the
/// grid (by name), the ones hidden, and whether it was ever arranged (a
/// layout never arranged follows the default for what there is to show)
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct HomeLayout {
    pub places: Vec<ModulePlace>,
    pub hidden: Vec<String>,
    pub custom: bool,
}

/// A module's cell: its column and row, from 0
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ModulePlace {
    pub module: String,
    pub x: u8,
    pub y: u16,
}

/// The real exam the candidate aims at
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub struct ExamTarget {
    pub certification: String,
    /// The exam day, YYYY-MM-DD
    pub date: String,
    /// The day the preparation started (the target was set), YYYY-MM-DD
    pub started: String,
    /// Days of the week kept free, 0 Monday to 6 Sunday
    #[serde(default)]
    pub rest_days: Vec<u8>,
}

/// The app's appearance
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// As macOS is set, following it when it changes
    System,
    Light,
    #[default]
    Dark,
}

/// How the sidebar lists the screens and the exams: in the order the
/// candidate dragged them (what was never dragged after, as it comes), and
/// what is folded or hidden
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(default)]
pub struct SidebarLayout {
    /// Certifications, in order
    pub groups: Vec<String>,
    /// Exam ids, in order
    pub exams: Vec<String>,
    /// Certifications whose exams are folded away
    pub collapsed: Vec<String>,
    /// Certifications not in the sidebar at all
    pub hidden: Vec<String>,
    /// The screens (their paths), in order
    pub screens: Vec<String>,
    /// Screens not in the sidebar (Exams always is)
    pub hidden_screens: Vec<String>,
    /// Exams pinned to the top of the sidebar, in order
    pub pinned: Vec<String>,
    /// How each certification sorts its exams (by default: as dragged)
    pub sort: std::collections::BTreeMap<String, ExamSort>,
}

/// How a certification's exams are sorted in the sidebar
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExamSort {
    /// As dragged; the rest as they come
    #[default]
    Manual,
    /// Practised most recently first; never practised after
    Recent,
    /// By name
    Name,
    /// Lowest last score first; never practised before them
    Score,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            desktop_zoom: 1.0,
            desktop_resolution: None,
            question_size: 1,
            task_width: 34.0,
            assistant_open: false,
            assistant_width: 380,
            assistant_model: None,
            assistant_effort: None,
            assistant_enabled: true,
            analytics: true,
            sidebar_folded: false,
            sidebar: SidebarLayout::default(),
            theme: Theme::Dark,
            targets: Vec::new(),
            target: None,
            focus: None,
            home: HomeLayout::default(),
        }
    }
}

impl Store {
    pub fn settings(&self) -> AppResult<Settings> {
        let mut settings: Settings = self.setting("exam_desk")?;
        // Saved before there could be several exams: the one becomes the list
        if settings.targets.is_empty()
            && let Some(target) = settings.target.clone()
        {
            settings.targets.push(target);
        }
        Ok(settings)
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        // `target` follows the list, so an older ckpro reads the first exam
        let settings = Settings { target: settings.targets.first().cloned(), ..settings.clone() };
        self.save_setting("exam_desk", &settings)
    }

    /// What the exam nodes were measured to take on this machine
    pub fn footprint(&self) -> AppResult<Footprint> {
        self.setting("footprint")
    }

    pub fn save_footprint(&self, footprint: &Footprint) -> AppResult<()> {
        self.save_setting("footprint", footprint)
    }

    /// A value kept as JSON under `key`; its default when unset or unreadable
    pub fn setting<T: DeserializeOwned + Default>(&self, key: &str) -> AppResult<T> {
        self.setting_or(key, T::default)
    }

    /// A value kept as JSON under `key`: its default when unset, `unreadable`'s
    /// when it cannot be read (damaged, or written by a newer ckpro), which
    /// the log tells
    pub fn setting_or<T: DeserializeOwned + Default>(&self, key: &str, unreadable: impl FnOnce() -> T) -> AppResult<T> {
        let json: Option<String> = self
            .conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .map_err(db)?;
        let Some(json) = json else { return Ok(T::default()) };
        Ok(serde_json::from_str(&json).unwrap_or_else(|e| {
            tracing::warn!(key, error = %e, "a setting could not be read");
            unreadable()
        }))
    }

    pub fn save_setting<T: Serialize>(&self, key: &str, value: &T) -> AppResult<()> {
        self.conn()
            .execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)", params![key, to_json(value)?])
            .map_err(db)?;
        Ok(())
    }

    /// Exams gone: the sidebar no longer lists or pins them
    pub fn forget_in_sidebar(&self, exam_ids: &[String]) -> AppResult<()> {
        let mut settings = self.settings()?;
        let before = settings.sidebar.clone();
        settings.sidebar.pinned.retain(|id| !exam_ids.contains(id));
        settings.sidebar.exams.retain(|id| !exam_ids.contains(id));
        if settings.sidebar != before {
            self.save_settings(&settings)?;
        }
        Ok(())
    }
}
