//! The candidate's plans (an exam on a day) and how ready they are for the
//! exam they aim at: both worked out from the history, without AI. Days are
//! the candidate's own (`offset_minutes` east of UTC, from the interface).

use super::insights::{DomainStat, study_stats};
use super::{Exams, HistoryEntry, Mode};
use crate::error::{AppError, AppResult};
use crate::store::StoredPlan;
use serde::{Deserialize, Serialize};

/// An exam planned for a day, and whether it was taken
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct PlanView {
    pub id: i32,
    /// YYYY-MM-DD
    pub day: String,
    pub exam_id: String,
    pub title: String,
    pub certification: String,
    pub mode: Mode,
    /// Taken that day (any mode): the best score of that day's attempts
    pub done: Option<f64>,
}

/// How ready the candidate is for a certification: per domain over recent
/// attempts, and the score that predicts, weighted as on the exam
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct ExamReadiness {
    pub certification: String,
    pub title: String,
    pub pass_score: u32,
    /// Weighted by the domains with results; none before any attempt
    pub predicted: Option<f64>,
    /// Share of the exam's weight the results cover, in percent
    pub coverage: u32,
    /// The days the results come from (30), or 0 for all time
    pub window_days: u32,
    /// Heaviest domain first
    pub domains: Vec<DomainStat>,
}

/// Recent results first: a month back, or all of them when the month has none
const WINDOW_DAYS: u32 = 30;

/// The day (YYYY-MM-DD) a moment (Unix ms) falls on, `offset_minutes` east of UTC
pub fn day_of(ms: f64, offset_minutes: i32) -> String {
    let days = ((ms / 1000.0 + f64::from(offset_minutes) * 60.0) / 86_400.0).floor() as i64;
    // Days since 1970-01-01 to a civil date (H. Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

const fn mode_name(mode: Mode) -> &'static str {
    match mode {
        Mode::Exam => "exam",
        Mode::Practice => "practice",
    }
}

/// A day as YYYY-MM-DD, or an error naming it
fn checked_day(day: &str) -> AppResult<&str> {
    let ok = day.len() == 10
        && day.char_indices().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() });
    ok.then_some(day).ok_or_else(|| AppError::invalid(format!("not a day: {day}")))
}

/// Each plan with its exam and whether `history` has it taken on its day
fn views(plans: Vec<StoredPlan>, exams: &Exams, history: &[HistoryEntry], offset_minutes: i32) -> Vec<PlanView> {
    let pack = exams.pack();
    plans
        .into_iter()
        .map(|p| {
            let exam = pack.exams.get(&p.exam_id).map(|e| &e.value);
            let done = history
                .iter()
                .filter(|h| h.exam_id == p.exam_id && h.result.worked())
                .filter(|h| day_of(h.result.started_at, offset_minutes) == p.day)
                .map(|h| h.result.score)
                .fold(None, |best: Option<f64>, s| Some(best.map_or(s, |b| b.max(s))));
            PlanView {
                id: p.id,
                title: exam.map(|e| e.title.clone()).unwrap_or_else(|| p.exam_id.clone()),
                certification: exam.map(|e| e.certification.clone()).unwrap_or_default(),
                mode: if p.mode == "exam" { Mode::Exam } else { Mode::Practice },
                day: p.day,
                exam_id: p.exam_id,
                done,
            }
        })
        .collect()
}

impl Exams {
    /// The plans from `from` to `to` (both included)
    pub fn plans_between(&self, from: &str, to: &str, offset_minutes: i32) -> AppResult<Vec<PlanView>> {
        let plans = self.store.plans(checked_day(from)?, checked_day(to)?)?;
        Ok(views(plans, self, &self.history(), offset_minutes))
    }

    /// Plan an exam of the bank on a day
    pub fn plan_add(&self, day: &str, exam_id: &str, mode: Mode) -> AppResult<i32> {
        if !self.pack().exams.contains_key(exam_id) {
            return Err(AppError::not_found(format!("no exam '{exam_id}'")));
        }
        self.store.add_plan(checked_day(day)?, exam_id, mode_name(mode))
    }

    /// Move a plan to another day, or take it the other way
    pub fn plan_update(&self, id: i32, day: Option<String>, mode: Option<Mode>) -> AppResult<()> {
        let day = day.as_deref().map(checked_day).transpose()?;
        self.store.update_plan(id, day, mode.map(mode_name))
    }

    pub fn plan_remove(&self, id: i32) -> AppResult<()> {
        self.store.remove_plan(id)
    }

    /// How ready the candidate is for `certification`, as of `now` (Unix ms)
    pub fn readiness(&self, certification: &str, now: f64) -> AppResult<ExamReadiness> {
        readiness(&self.pack(), &self.history(), certification, now)
    }
}

/// See [`ExamReadiness`]: the last month's attempts of the certification, or all
/// of them when the month has none
pub fn readiness(
    pack: &super::LoadedPack,
    history: &[HistoryEntry],
    certification: &str,
    now: f64,
) -> AppResult<ExamReadiness> {
    let cert = pack
        .pack
        .certifications
        .get(certification)
        .ok_or_else(|| AppError::not_found(format!("no certification '{certification}'")))?;
    let since = now - f64::from(WINDOW_DAYS) * 86_400_000.0;
    let history: Vec<HistoryEntry> = history.iter().filter(|h| h.result.worked()).cloned().collect();
    let recent: Vec<HistoryEntry> =
        history.iter().filter(|h| h.result.started_at >= since).cloned().collect();
    let pick = |entries: &[HistoryEntry]| study_stats(pack, entries).into_iter().find(|s| s.certification == certification);
    let (stats, window_days) = match pick(&recent) {
        Some(s) => (Some(s), WINDOW_DAYS),
        None => (pick(&history), 0),
    };
    let domains = stats.map(|s| s.domains).unwrap_or_else(|| {
        let mut domains: Vec<DomainStat> = cert
            .domains
            .iter()
            .map(|(domain, weight)| DomainStat { domain: domain.clone(), weight: *weight, points: 0, max_points: 0, questions: 0 })
            .collect();
        domains.sort_by_key(|d| std::cmp::Reverse(d.weight));
        domains
    });
    let tested: Vec<&DomainStat> = domains.iter().filter(|d| d.max_points > 0).collect();
    let covered: u32 = tested.iter().map(|d| d.weight).sum();
    let predicted = (covered > 0).then(|| {
        tested.iter().map(|d| f64::from(d.weight) * f64::from(d.points) / f64::from(d.max_points)).sum::<f64>()
            / f64::from(covered)
            * 100.0
    });
    let total: u32 = domains.iter().map(|d| d.weight).sum::<u32>().max(1);
    Ok(ExamReadiness {
        certification: certification.to_string(),
        title: cert.title.clone(),
        pass_score: cert.pass_score,
        predicted,
        coverage: covered * 100 / total,
        window_days,
        domains,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_moment_falls_on_the_candidates_own_day() {
        // 2026-10-31 23:30 UTC
        let t = 1_793_489_400_000.0;
        assert_eq!(day_of(t, 0), "2026-10-31");
        assert_eq!(day_of(t, 7 * 60), "2026-11-01");
        assert_eq!(day_of(t, -5 * 60), "2026-10-31");
        assert_eq!(day_of(0.0, 0), "1970-01-01");
        assert_eq!(day_of(951_782_400_000.0, 0), "2000-02-29");
    }

    #[test]
    fn days_are_checked() {
        assert!(checked_day("2026-11-05").is_ok());
        for wrong in ["2026-1-05", "20261105", "2026-11-0x", "' OR 1"] {
            assert!(checked_day(wrong).is_err(), "{wrong}");
        }
    }

    /// Two CKA attempts: the predicted score weighs each tested domain as the
    /// exam does, an untested domain lowers the coverage, not the score, and an
    /// attempt without a point is left out
    #[test]
    fn readiness_weighs_domains_as_the_exam() {
        use super::super::{ExamResult, QuestionResult};
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packs/core");
        let pack = crate::lab::load::load(&root).0.expect("the core pack loads");
        // One question of two domains of the CKA
        let of = |domain: &str| {
            pack.questions.iter().find(|(_, q)| q.value.certifications.get("cka").is_some_and(|d| d == domain)).map(|(id, _)| id.clone()).unwrap()
        };
        let (trouble, storage) = (of("troubleshooting"), of("storage"));
        let exam = pack.exams.iter().find(|(_, e)| e.value.certification == "cka").map(|(id, _)| id.clone()).unwrap();
        let entry = |at: f64, results: &[(&str, u32)]| HistoryEntry {
            attempt_id: format!("{at}"),
            exam_id: exam.clone(),
            title: "CKA".into(),
            mode: Mode::Practice,
            pass_score: 66,
            result: ExamResult {
                score: results.iter().map(|(_, points)| f64::from(*points)).sum(),
                passed: false,
                started_at: at,
                finished_at: at,
                questions: results
                    .iter()
                    .map(|(id, points)| QuestionResult { id: id.to_string(), title: String::new(), points: *points, max_points: 10, checks: Vec::new() })
                    .collect(),
                outside: Vec::new(),
                assisted: Vec::new(),
            },
        };
        let now = 1_800_000_000_000.0;
        let day = 86_400_000.0;
        let history = [entry(now - day, &[(&trouble, 9)]), entry(now - 2.0 * day, &[(&storage, 4)])];
        let r = readiness(&pack, &history, "cka", now).unwrap();
        assert_eq!(r.window_days, 30);
        // troubleshooting 30% at 90%, storage 10% at 40%: (27 + 4) / 40
        assert!((r.predicted.unwrap() - 77.5).abs() < 0.01, "{:?}", r.predicted);
        assert_eq!(r.coverage, 40);
        // Older than a month only: all time is used instead
        let old = readiness(&pack, &[entry(now - 90.0 * day, &[(&storage, 4)])], "cka", now).unwrap();
        assert_eq!((old.window_days, old.predicted.map(f64::round)), (0, Some(40.0)));
        assert!(readiness(&pack, &[], "cka", now).unwrap().predicted.is_none());
        // An attempt ended before any point measures nothing
        let unworked = readiness(&pack, &[entry(now - day, &[(&trouble, 0)])], "cka", now).unwrap();
        assert_eq!((unworked.predicted, unworked.coverage), (None, 0));
    }
}
