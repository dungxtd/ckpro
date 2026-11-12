//! `ckpro demo`: a preparation in full swing put into ckpro's data, to look
//! at the app with something in it (Home, the Calendar, History): three
//! exams aimed at (CKA, CKAD, then CKS), seven weeks of attempts on the
//! bundled exams with their failed checks, and plans to each exam day.
//! Everything it adds is marked, and `ckpro demo --remove` takes it away
//! and puts back the exams aimed at before. Into the app's data directory
//! (the one `CKPRO_DATA_DIR` names, else its own) or `--dir`.

use crate::lab::checks::CheckResult;
use crate::lab::exam::{ExamResult, HistoryEntry, Mode, QuestionResult};
use crate::lab::load::LoadedPack;
use crate::store::Store;
use crate::store::ExamTarget;
use std::path::Path;

const DAY_MS: f64 = 86_400_000.0;

/// A small deterministic generator: the same demo every time
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6_364_136_223_846_793_005).wrapping_add(1_442_695_040_888_963_407);
        ((self.0 >> 33) as f64) / f64::from(1u32 << 31)
    }
}

/// YYYY-MM-DD of a moment, in UTC (the demo's days need not be exact to the hour)
fn day(ms: f64) -> String {
    crate::lab::exam::plan::day_of(ms, 0)
}

/// What the demo added, kept so `--remove` takes exactly that away
#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Added {
    /// The exams aimed at before it, put back on removal
    targets_before: Vec<ExamTarget>,
    plans: Vec<i32>,
}
const KEY: &str = "demo";
const ID_PREFIX: &str = "demo-";

fn open(dir: &Path) -> Result<Store, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    Store::open(&dir.join(crate::DATABASE)).map_err(|e| e.to_string())
}

/// Takes away what the demo added, and puts back the exams aimed at before
pub fn remove(dir: &Path) -> Result<String, String> {
    let store = open(dir)?;
    let Some(added) = store.setting::<Option<Added>>(KEY).map_err(|e| e.to_string())? else {
        return Ok(format!("No demo in {}", dir.display()));
    };
    let attempts = store.remove_history_with_prefix(ID_PREFIX).map_err(|e| e.to_string())?;
    for id in &added.plans {
        store.remove_plan(*id).map_err(|e| e.to_string())?;
    }
    let mut settings = store.settings().map_err(|e| e.to_string())?;
    settings.targets = added.targets_before;
    store.save_settings(&settings).map_err(|e| e.to_string())?;
    store.save_setting(KEY, &None::<Added>).map_err(|e| e.to_string())?;
    Ok(format!("Removed the demo's {attempts} attempts and {} plans from {}", added.plans.len(), dir.display()))
}

pub fn seed(dir: &Path, pack: &LoadedPack) -> Result<String, String> {
    let store = open(dir)?;
    if store.setting::<Option<Added>>(KEY).map_err(|e| e.to_string())?.is_some() {
        return Err(format!("{} holds the demo already: `ckpro demo --remove` first", dir.display()));
    }
    let now = crate::runtime::activity::now_ms();
    let mut rng = Rng(7);
    let mut added = Added { targets_before: store.settings().map_err(|e| e.to_string())?.targets, plans: vec![] };

    // Three exams: CKA soonest, CKAD after it, CKS (which needs a passed CKA) last
    let targets = vec![
        ExamTarget { certification: "cka".into(), date: day(now + 45.0 * DAY_MS), started: day(now - 49.0 * DAY_MS), rest_days: vec![6] },
        ExamTarget { certification: "ckad".into(), date: day(now + 128.0 * DAY_MS), started: day(now - 21.0 * DAY_MS), rest_days: vec![6] },
        ExamTarget { certification: "cks".into(), date: day(now + 230.0 * DAY_MS), started: day(now - 3.0 * DAY_MS), rest_days: vec![] },
    ];
    let mut settings = store.settings().map_err(|e| e.to_string())?;
    settings.targets = targets;
    store.save_settings(&settings).map_err(|e| e.to_string())?;

    // The bundled exams per certification, with their fixed questions
    let exams_of = |cert: &str| -> Vec<(String, String, u32, Vec<String>)> {
        pack.exams
            .iter()
            .filter(|(_, e)| e.value.certification == cert)
            .map(|(id, e)| {
                let pass = e.value.pass_score.or_else(|| pack.pack.certifications.get(cert).map(|c| c.pass_score)).unwrap_or(66);
                (id.clone(), e.value.title.clone(), pass, e.value.questions.clone())
            })
            .collect()
    };

    // Seven weeks of attempts: CKA from the start, CKAD for the last three
    // weeks, a first CKS try this week; better as the weeks go
    let mut attempts = 0;
    for back in (0..=49).rev() {
        let when = now - f64::from(back) * DAY_MS;
        let weekday = ((when / DAY_MS).floor() as i64 + 3).rem_euclid(7);
        if weekday == 6 || rng.next() < 0.3 {
            continue;
        }
        let progress = 1.0 - f64::from(back) / 49.0;
        let mut certs = vec!["cka"];
        if back <= 21 {
            certs.push("ckad");
        }
        if back <= 3 {
            certs.push("cks");
        }
        let cert = certs[(rng.next() * certs.len() as f64) as usize % certs.len()];
        let exams = exams_of(cert);
        if exams.is_empty() {
            continue;
        }
        let (exam_id, title, pass, questions) = &exams[(rng.next() * exams.len() as f64) as usize % exams.len()];
        let skill = 0.35 + 0.45 * progress + if cert == "cka" { 0.05 } else { 0.0 };
        let mut results = Vec::new();
        let (mut points, mut max) = (0u32, 0u32);
        for qid in questions.iter().take(12) {
            let Some(q) = pack.questions.get(qid) else { continue };
            let checks: Vec<CheckResult> = q
                .value
                .checks
                .iter()
                .map(|c| CheckResult { name: c.name.clone(), weight: c.weight, passed: rng.next() < skill, detail: String::new() })
                .collect();
            let got: u32 = checks.iter().filter(|c| c.passed).map(|c| c.weight).sum();
            let all: u32 = checks.iter().map(|c| c.weight).sum();
            points += got;
            max += all;
            results.push(QuestionResult { id: qid.clone(), title: q.value.title.clone(), points: got, max_points: all, checks });
        }
        if max == 0 {
            continue;
        }
        let started = when - (10.0 + rng.next() * 9.0) * 3_600_000.0 + 8.0 * 3_600_000.0;
        let minutes = 25.0 + rng.next() * if rng.next() < 0.2 { 120.0 } else { 60.0 };
        let score = f64::from(points) * 100.0 / f64::from(max);
        let mode = if rng.next() < 0.2 { Mode::Exam } else { Mode::Practice };
        let id = format!("{ID_PREFIX}{back}-{attempts}");
        let entry = HistoryEntry {
            attempt_id: id.clone(),
            exam_id: exam_id.clone(),
            title: title.clone(),
            certification: cert.into(),
            mode,
            pass_score: *pass,
            result: ExamResult {
                score,
                passed: score >= f64::from(*pass),
                started_at: started,
                finished_at: started + minutes * 60_000.0,
                questions: results,
                outside: vec![],
                assisted: vec![],
                prediction: None,
            },
        };
        store.add_history(&id, exam_id, entry.result.finished_at, &entry).map_err(|e| e.to_string())?;
        attempts += 1;
    }

    // Plans: CKA on Mondays, Wednesdays and Fridays up to its day; CKAD on
    // Tuesdays and Thursdays; CKS on weekends once the CKA is taken
    let mut plans = 0;
    for ahead in 1..=230 {
        let when = now + f64::from(ahead) * DAY_MS;
        let weekday = ((when / DAY_MS).floor() as i64 + 3).rem_euclid(7);
        let cert = match weekday {
            0 | 2 | 4 if ahead <= 45 => "cka",
            1 | 3 if ahead <= 128 => "ckad",
            5 if ahead > 45 => "cks",
            _ => continue,
        };
        if rng.next() < 0.2 {
            continue;
        }
        let exams = exams_of(cert);
        if exams.is_empty() {
            continue;
        }
        let (exam_id, ..) = &exams[(rng.next() * exams.len() as f64) as usize % exams.len()];
        let mode = if ahead % 14 == 0 { "exam" } else { "practice" };
        added.plans.push(store.add_plan(&day(when), exam_id, mode).map_err(|e| e.to_string())?);
        plans += 1;
    }
    store.save_setting(KEY, &Some(added)).map_err(|e| e.to_string())?;
    Ok(format!("{attempts} attempts and {plans} plans for CKA, CKAD and CKS in {}", dir.display()))
}
