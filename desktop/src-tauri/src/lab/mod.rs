pub mod checks;
pub mod exam;
pub mod lint;
pub mod load;
pub mod mine;
pub mod model;
pub mod render;
pub mod script;
pub mod verify;

/// JSON Schemas of the pack files, generated from the model types.
pub fn schemas() -> Vec<(&'static str, serde_json::Value)> {
    vec![
        ("pack.schema.json", serde_json::to_value(schemars::schema_for!(model::Pack)).unwrap_or_default()),
        ("question.schema.json", serde_json::to_value(schemars::schema_for!(model::Question)).unwrap_or_default()),
        ("exam.schema.json", serde_json::to_value(schemars::schema_for!(model::Exam)).unwrap_or_default()),
    ]
}
