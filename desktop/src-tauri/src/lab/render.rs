//! Fill a question's `{{var}}` placeholders with values picked for one attempt.

use super::model::Question;
use rand::seq::IndexedRandom;
use std::collections::BTreeMap;

pub type Values = BTreeMap<String, String>;

/// Pick a value for every var: at random for an attempt, or always the
/// first one (`deterministic`) so `lab verify` is reproducible.
pub fn pick(question: &Question, deterministic: bool) -> Values {
    let mut rng = rand::rng();
    question
        .vars
        .iter()
        .filter_map(|(name, var)| {
            let value = if deterministic { var.pick.first() } else { var.pick.choose(&mut rng) };
            Some((name.clone(), value?.clone()))
        })
        .collect()
}

/// The question with every placeholder replaced, in every text and script.
pub fn render(question: &Question, values: &Values) -> Question {
    if values.is_empty() {
        return question.clone();
    }
    // Every string field, including nested check specs, goes through JSON;
    // values are inserted JSON-escaped so they cannot break the document
    let mut json = serde_json::to_string(question).expect("question serializes");
    for (name, value) in values {
        let escaped = serde_json::to_string(value).expect("string serializes");
        json = json.replace(&format!("{{{{{name}}}}}"), &escaped[1..escaped.len() - 1]);
    }
    serde_json::from_str(&json).expect("rendered question deserializes")
}
