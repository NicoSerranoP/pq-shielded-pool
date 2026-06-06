use stark_evm_adapter::{
    annotated_proof::AnnotatedProof,
    annotation_parser::{split_fri_merkle_statements, SplitProofs},
};
use std::{env, fs::read_to_string};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let annotated_path = env::var("ANNOTATED_PROOF")?;
    let annotated: AnnotatedProof = serde_json::from_str(&read_to_string(annotated_path)?)?;
    let split: SplitProofs = split_fri_merkle_statements(annotated)?;

    if let Ok(out) = env::var("SPLIT_PROOF_OUT") {
        std::fs::write(&out, serde_json::to_string_pretty(&split)?)?;
        println!("split_proof_out={out}");
    }

    let (_, continuous_pages) = split.main_proof.memory_page_registration_args();
    println!("main_proof_words={}", split.main_proof.proof.len());
    println!("trace_merkle_statements={}", split.merkle_statements.len());
    println!("fri_merkle_statements={}", split.fri_merkle_statements.len());
    println!("continuous_memory_pages={}", continuous_pages.len());

    Ok(())
}
