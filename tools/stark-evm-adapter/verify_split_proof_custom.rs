use ethers::{
    contract::ContractError,
    core::k256::ecdsa::SigningKey,
    middleware::SignerMiddleware,
    providers::{Http, Middleware, Provider},
    signers::{LocalWallet, Signer, Wallet},
    types::{Address, U256, U64},
    utils::hex,
};
use stark_evm_adapter::{
    annotated_proof::AnnotatedProof,
    annotation_parser::{split_fri_merkle_statements, SplitProofs},
    oods_statement::FactTopology,
    ContractFunctionCall,
};
use std::{convert::TryFrom, env, fs::read_to_string, str::FromStr, sync::Arc};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = env::var("URL")?;
    let provider = Provider::<Http>::try_from(url.as_str())?;

    let private_key = env::var("PRIVATE_KEY").unwrap_or(
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d".to_string(),
    );
    let from_key_bytes = hex::decode(private_key.trim_start_matches("0x"))?;
    let from_signing_key = SigningKey::from_bytes(from_key_bytes.as_slice().into())?;
    let from_wallet: LocalWallet = LocalWallet::from(from_signing_key);
    println!("Test wallet address: {:?}", from_wallet.address());

    let chain_id = provider.get_chainid().await?.as_u32();
    let signer: Arc<SignerMiddleware<_, _>> = Arc::new(SignerMiddleware::new(
        provider.clone(),
        from_wallet.with_chain_id(chain_id),
    ));

    let split_proofs = if let Ok(split_path) = env::var("SPLIT_PROOF") {
        serde_json::from_str::<SplitProofs>(&read_to_string(split_path)?)?
    } else {
        let origin_proof_file = read_to_string(env::var("ANNOTATED_PROOF")?)?;
        let annotated_proof: AnnotatedProof = serde_json::from_str(&origin_proof_file)?;
        split_fri_merkle_statements(annotated_proof)?
    };

    println!("Verifying trace decommitments:");
    let mut total_gas = U256::zero();
    let trace_contract = Address::from_str(
        &env::var("TRACE_CONTRACT")
            .unwrap_or("0x634dcf4f1421fc4d95a968a559a450ad0245804c".to_string()),
    )?;
    for i in 0..split_proofs.merkle_statements.len() {
        let key = format!("Trace {}", i);
        let trace_merkle = split_proofs.merkle_statements.get(&key).unwrap();
        let call = trace_merkle.verify(trace_contract, signer.clone());
        total_gas += assert_call(call, &key).await?;
    }

    println!("Verifying FRI decommitments:");
    let fri_contract = Address::from_str(
        &env::var("FRI_CONTRACT")
            .unwrap_or("0xdef8a3b280a54ee7ed4f72e1c7d6098ad8df44fb".to_string()),
    )?;
    for (i, fri_statement) in split_proofs.fri_merkle_statements.iter().enumerate() {
        let call = fri_statement.verify(fri_contract, signer.clone());
        total_gas += assert_call(call, &format!("FRI statement: {}", i)).await?;
    }

    let (_, continuous_pages) = split_proofs.main_proof.memory_page_registration_args();
    let memory_fact_registry = Address::from_str(
        &env::var("MEMORY_FACT_REGISTRY")
            .unwrap_or("0x40864568f679c10ac9e72211500096a5130770fa".to_string()),
    )?;

    for (index, page) in continuous_pages.iter().enumerate() {
        let call = split_proofs.main_proof.register_continuous_memory_page(
            memory_fact_registry,
            signer.clone(),
            page.clone(),
        );
        total_gas += assert_call(call, &format!("register continuous page: {}", index)).await?;
    }

    let task_metadata_mode = env::var("TASK_METADATA_MODE").unwrap_or("empty".to_string());
    let task_metadata = match task_metadata_mode.as_str() {
        "empty" => Vec::<U256>::new(),
        "manual" => parse_u256_list(&env::var("TASK_METADATA")?)?,
        "bootloader" => {
            let topologies_file = read_to_string(env::var("FACT_TOPOLOGIES")?)?;
            let topology_json: serde_json::Value = serde_json::from_str(&topologies_file)?;
            let fact_topologies: Vec<FactTopology> =
                serde_json::from_value(topology_json.get("fact_topologies").unwrap().clone())?;
            split_proofs
                .main_proof
                .generate_tasks_metadata(true, fact_topologies)?
        }
        other => return Err(format!("unsupported TASK_METADATA_MODE={other}").into()),
    };

    println!(
        "Verifying main proof with TASK_METADATA_MODE={} ({} words):",
        task_metadata_mode,
        task_metadata.len()
    );
    let main_contract = Address::from_str(
        &env::var("MAIN_VERIFIER")
            .unwrap_or("0xd51a3d50d4d2f99a345a66971e650eea064dd8df".to_string()),
    )?;
    let call = split_proofs
        .main_proof
        .verify(main_contract, signer, task_metadata);

    total_gas += assert_call(call, "Main proof").await?;

    println!("Total verifier gas used: {}", total_gas);

    Ok(())
}

fn parse_u256_list(raw: &str) -> Result<Vec<U256>, Box<dyn std::error::Error>> {
    raw.split(char::from(44))
        .map(|part| {
            let trimmed = part.trim();
            if let Some(hex) = trimmed.strip_prefix("0x") {
                U256::from_str_radix(hex, 16).map_err(|e| e.into())
            } else {
                U256::from_dec_str(trimmed).map_err(|e| e.into())
            }
        })
        .collect()
}

async fn assert_call(
    call: ContractFunctionCall,
    name: &str,
) -> Result<U256, Box<dyn std::error::Error>> {
    match call.send().await {
        Ok(pending_tx) => match pending_tx.await {
            Ok(mined_tx) => {
                let tx_receipt = mined_tx.unwrap();
                if tx_receipt.status.unwrap_or_default() == U64::from(1) {
                    let gas_used = tx_receipt.gas_used.unwrap_or_default();
                    println!("Verified: {} gasUsed={}", name, gas_used);
                    Ok(gas_used)
                } else {
                    Err(format!("Transaction failed: {}, but did not revert.", name).into())
                }
            }
            Err(e) => Err(decode_revert_message(e.into()).into()),
        },
        Err(e) => Err(decode_revert_message(e).into()),
    }
}

fn decode_revert_message(
    e: ContractError<SignerMiddleware<Provider<Http>, Wallet<SigningKey>>>,
) -> String {
    match e {
        ContractError::Revert(err) => {
            println!("Revert data: {:?}", err.0);
            err.to_string()
        }
        _ => format!("Transaction failed: {:?}", e),
    }
}
