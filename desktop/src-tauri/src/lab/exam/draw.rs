//! The exam catalog and drawing an attempt's questions and clusters.

use super::*;
use std::collections::HashMap;

impl Exams {
    pub fn catalog(&self) -> Vec<ExamSummary> {
        catalog(&self.pack(), &self.store.footprint().unwrap_or_default())
    }

    /// The certification's allowed docs plus the tasks' own references
    pub(super) fn allowed_docs(&self, certification: &str, questions: &[(String, Question)]) -> Vec<String> {
        let pack = self.pack();
        let mut allowed = pack.pack.certifications.get(certification).map(|c| c.resources.clone()).unwrap_or_default();
        allowed.extend(questions.iter().flat_map(|(_, q)| q.references.iter().cloned()));
        // In order, each once (the same reference can come from several tasks)
        let mut seen = std::collections::HashSet::new();
        allowed.retain(|url| seen.insert(url.clone()));
        allowed
    }

    pub(super) fn draw(&self, exam: &Exam) -> Vec<(String, Question)> {
        let pack = self.pack();
        let mut ids = exam.questions.clone();
        if let Some(draw) = &exam.random {
            let cert = &pack.pack.certifications[&exam.certification];
            let weights = draw.weights.as_ref().unwrap_or(&cert.domains);
            let mut rng = rand::rng();
            let seen = seen_questions(&self.history());
            let mut drawn = Vec::new();
            for (domain, count) in allocate(draw.count, weights) {
                let mut pool: Vec<&String> = pack
                    .questions
                    .iter()
                    .filter(|(id, q)| {
                        q.value.certifications.get(&exam.certification) == Some(&domain)
                            && q.value.runnable()
                            && !ids.contains(id)
                    })
                    .map(|(id, _)| id)
                    .collect();
                pool.shuffle(&mut rng);
                // Over several attempts the whole bank comes up: never
                // answered first, then not yet solved, solved last (random
                // within each)
                pool.sort_by_key(|id| coverage_rank(&seen, id));
                drawn.extend(pool.into_iter().take(count as usize).cloned());
            }
            drawn.shuffle(&mut rng);
            ids.extend(drawn);
        }
        ids.into_iter()
            .filter_map(|id| {
                let q = &pack.questions.get(&id)?.value;
                if !q.runnable() {
                    tracing::info!(question = %id, "left out: needs {:?}", q.requires);
                    return None;
                }
                // The app's clusters keep their logical names
                Some((id, render::render(q, &render::pick(q, false), &q.cluster)))
            })
            .collect()
    }
}

/// The exams of `pack`, sized with the nodes `measured` on this machine
pub fn catalog(pack: &LoadedPack, measured: &crate::runtime::preflight::Footprint) -> Vec<ExamSummary> {
    pack
        .exams
        .iter()
        .filter_map(|(id, e)| {
            let cert = pack.pack.certifications.get(&e.value.certification)?;
            let fixed = e
                .value
                .questions
                .iter()
                .filter(|id| pack.questions.get(*id).is_some_and(|q| q.value.runnable()))
                .count() as u32;
            let topology = worst_topology(&pack, &e.value);
            Some(ExamSummary {
                memory_mb: crate::runtime::preflight::exam_memory_mb(&topology),
                minimum_mb: crate::runtime::preflight::exam_minimum_mb(&topology, measured),
                nodes: topology.values().map(|w| 1 + u32::from(*w)).sum(),
                clusters: topology.keys().cloned().collect(),
                id: id.clone(),
                title: e.value.title.clone(),
                description: e.value.description.clone(),
                certification: e.value.certification.clone(),
                questions: fixed + e.value.random.as_ref().map_or(0, |r| r.count),
                duration_minutes: (e.value.duration.as_ref().unwrap_or(&cert.duration).seconds().unwrap_or(0) / 60) as u32,
                pass_score: e.value.pass_score.unwrap_or(cert.pass_score),
                custom: id.starts_with(&format!("{}/", crate::lab::mine::PACK_ID)),
            })
        })
        .collect()
}

/// Questions answered in earlier attempts: whether one ever got full marks
fn seen_questions(history: &[HistoryEntry]) -> HashMap<String, bool> {
    let mut seen = HashMap::new();
    for q in history.iter().flat_map(|h| &h.result.questions) {
        let solved: &mut bool = seen.entry(q.id.clone()).or_default();
        *solved |= q.max_points > 0 && q.points == q.max_points;
    }
    seen
}

/// Draw order over the bank: never answered, then not yet solved, then solved
fn coverage_rank(seen: &HashMap<String, bool>, id: &str) -> u8 {
    match seen.get(id) {
        None => 0,
        Some(false) => 1,
        Some(true) => 2,
    }
}

/// One cluster per name, as large as its most demanding question.
/// The clusters an exam can need: its fixed questions, and for a random draw
/// the largest each cluster gets among the questions it may draw
pub(super) fn worst_topology(pack: &LoadedPack, exam: &Exam) -> BTreeMap<String, u8> {
    let fixed = exam.questions.iter().filter_map(|id| pack.questions.get(id));
    let drawable = exam.random.as_ref().into_iter().flat_map(|_| {
        pack.questions.values().filter(|q| q.value.certifications.contains_key(&exam.certification))
    });
    let mut clusters = BTreeMap::new();
    for q in fixed.chain(drawable).filter(|q| q.value.runnable()) {
        let workers: &mut u8 = clusters.entry(q.value.cluster.clone()).or_default();
        *workers = (*workers).max(q.value.workers);
    }
    clusters
}

pub(super) fn topology(questions: &[(String, Question)]) -> BTreeMap<String, u8> {
    let mut clusters = BTreeMap::new();
    for (_, q) in questions {
        let workers: &mut u8 = clusters.entry(q.cluster.clone()).or_default();
        *workers = (*workers).max(q.workers);
    }
    clusters
}

/// Split `count` questions across domains by weight (largest remainder).
pub(super) fn allocate(count: u32, weights: &BTreeMap<String, u32>) -> Vec<(String, u32)> {
    let total: u32 = weights.values().sum();
    if total == 0 {
        return Vec::new();
    }
    let mut shares: Vec<(String, u32, u32)> = weights
        .iter()
        .map(|(d, w)| (d.clone(), count * w / total, (count * w) % total))
        .collect();
    let mut left = count - shares.iter().map(|s| s.1).sum::<u32>();
    shares.sort_by(|a, b| b.2.cmp(&a.2));
    for share in shares.iter_mut() {
        if left == 0 {
            break;
        }
        share.1 += 1;
        left -= 1;
    }
    shares.into_iter().map(|(d, n, _)| (d, n)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(questions: &[(&str, u32, u32)]) -> HistoryEntry {
        HistoryEntry {
            attempt_id: String::new(),
            exam_id: String::new(),
            title: String::new(),
            certification: String::new(),
            mode: Mode::Practice,
            pass_score: 66,
            result: ExamResult {
                score: 0.0,
                passed: false,
                started_at: 0.0,
                finished_at: 0.0,
                questions: questions
                    .iter()
                    .map(|(id, points, max_points)| QuestionResult {
                        id: id.to_string(),
                        title: String::new(),
                        points: *points,
                        max_points: *max_points,
                        checks: Vec::new(),
                    })
                    .collect(),
                outside: Vec::new(),
                assisted: Vec::new(),
                prediction: None,
            },
        }
    }

    #[test]
    fn draws_cover_the_bank_new_then_unsolved_then_solved() {
        // "a" solved once then failed: still solved; "b" never solved
        let history = [entry(&[("a", 4, 4), ("b", 1, 4)]), entry(&[("a", 0, 4), ("b", 3, 4)])];
        let seen = seen_questions(&history);
        let mut pool = vec!["a", "b", "c"];
        pool.sort_by_key(|id| coverage_rank(&seen, id));
        assert_eq!(pool, ["c", "b", "a"]);
    }
}
