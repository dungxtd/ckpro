//! Fill a question's `{{var}}` placeholders: its own vars, picked for one
//! attempt, and built-ins that name the nodes of the cluster it runs on
//! (`{{control_plane}}`, `{{worker1}}`…), which differ between the app
//! (`k8s-worker`) and a verify run (`k8s-v1a2b-worker`).

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

/// Built-in placeholders, always available to questions
pub const BUILTINS: [&str; 12] = [
    "cluster",
    "control_plane",
    "etcd_certs",
    "worker1",
    "worker2",
    "worker3",
    "worker4",
    "worker5",
    "worker6",
    "worker7",
    "worker8",
    "worker9",
];

/// Values of the built-ins for a question on `physical` (its logical cluster
/// is the question's `cluster`).
pub fn builtins(logical: &str, physical: &str) -> Values {
    let mut values = Values::new();
    values.insert("cluster".into(), logical.into());
    values.insert("control_plane".into(), crate::cluster::kind::control_plane(physical));
    values.insert("etcd_certs".into(), crate::runtime::jumphost::Jumphost::etcd_certs(logical));
    // kind names workers <cluster>-worker, <cluster>-worker2, ...
    values.insert("worker1".into(), format!("{physical}-worker"));
    for i in 2..=9 {
        values.insert(format!("worker{i}"), format!("{physical}-worker{i}"));
    }
    values
}

/// The question with every placeholder replaced, in every text and script,
/// for an attempt on the physical cluster `physical`.
pub fn render(question: &Question, values: &Values, physical: &str) -> Question {
    let mut values = values.clone();
    values.extend(builtins(&question.cluster, physical));
    // Every string field, including nested check specs, goes through JSON;
    // values are inserted JSON-escaped so they cannot break the document
    let mut json = serde_json::to_string(question).expect("question serializes");
    for (name, value) in values {
        let escaped = serde_json::to_string(&value).expect("string serializes");
        json = json.replace(&format!("{{{{{name}}}}}"), &escaped[1..escaped.len() - 1]);
    }
    serde_json::from_str(&json).expect("rendered question deserializes")
}
