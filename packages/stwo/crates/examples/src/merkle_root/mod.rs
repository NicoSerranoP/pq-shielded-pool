use itertools::Itertools;
use num_traits::{One, Zero};
use stwo::core::air::Component;
use stwo::core::channel::{Blake2sM31Channel, Channel};
use stwo::core::fields::m31::BaseField;
use stwo::core::fields::qm31::SecureField;
use stwo::core::fields::FieldExpOps;
use stwo::core::pcs::{CommitmentSchemeVerifier, PcsConfig};
use stwo::core::poly::circle::CanonicCoset;
use stwo::core::proof::StarkProof;
use stwo::core::vcs_lifted::blake2_merkle::{Blake2sM31MerkleChannel, Blake2sM31MerkleHasher};
use stwo::core::verifier::{verify, VerificationError};
use stwo::core::ColumnVec;
use stwo::prover::backend::simd::SimdBackend;
use stwo::prover::backend::{Backend, Col, Column};
use stwo::prover::poly::circle::{CircleEvaluation, PolyOps};
use stwo::prover::poly::BitReversedOrder;
use stwo::prover::{prove, CommitmentSchemeProver};
use stwo_constraint_framework::{EvalAtRow, FrameworkComponent, FrameworkEval};

pub const MERKLE_DEPTH: usize = 4;
const LOG_CONSTRAINT_DEGREE: u32 = 1;

pub type MerkleRootComponent = FrameworkComponent<MerkleRootEval>;

#[derive(Clone, Debug)]
pub struct MerklePathInput {
    pub leaf_values: [BaseField; 2],
    pub siblings: [BaseField; MERKLE_DEPTH],
    pub indices: [bool; MERKLE_DEPTH],
}

#[derive(Clone, Debug)]
pub struct MerkleRootStatement {
    pub log_n_rows: u32,
    pub expected_root: BaseField,
}

impl MerkleRootStatement {
    pub fn mix_into(&self, channel: &mut impl Channel) {
        channel.mix_u64(self.log_n_rows as u64);
        channel.mix_felts(&[SecureField::from(self.expected_root.0)]);
    }
}

#[derive(Clone, Debug)]
pub struct MerkleRootEval {
    pub statement: MerkleRootStatement,
}

#[derive(Clone, Debug)]
pub struct MerkleRootProof {
    pub statement: MerkleRootStatement,
    pub stark_proof: StarkProof<Blake2sM31MerkleHasher>,
}

fn felt(value: u32) -> BaseField {
    BaseField::from_u32_unchecked(value)
}

/// Small algebraic hash used to test Stwo integration and Merkle constraints.
/// This is not intended to be a production hash.
pub fn algebraic_hash(left: BaseField, right: BaseField, domain: u32) -> BaseField {
    left.square() + right.square() * felt(7) + left * felt(3) + right * felt(5) + felt(11 + domain)
}

fn algebraic_hash_eval<E: EvalAtRow>(left: E::F, right: E::F, domain: u32) -> E::F {
    left.clone().square()
        + right.clone().square() * felt(7)
        + left * felt(3)
        + right * felt(5)
        + E::F::from(felt(11 + domain))
}

pub fn compute_root(input: &MerklePathInput) -> BaseField {
    let mut current = algebraic_hash(input.leaf_values[0], input.leaf_values[1], 1);

    for (&sibling, &index) in input.siblings.iter().zip(input.indices.iter()) {
        let (left, right) = if index {
            (sibling, current)
        } else {
            (current, sibling)
        };
        current = algebraic_hash(left, right, 0);
    }

    current
}

pub fn provekit_fixture_input() -> MerklePathInput {
    MerklePathInput {
        leaf_values: [felt(10), felt(11)],
        siblings: [felt(20), felt(30), felt(40), felt(50)],
        indices: [false, true, false, true],
    }
}

pub fn provekit_fixture_root() -> BaseField {
    felt(823_984_307)
}

pub fn generate_trace<B: Backend>(
    inputs: &[MerklePathInput],
) -> ColumnVec<CircleEvaluation<B, BaseField, BitReversedOrder>> {
    assert!(inputs.len().is_power_of_two());
    let log_size = inputs.len().ilog2();
    let n_columns = 3 + MERKLE_DEPTH * 5;
    let mut trace = (0..n_columns)
        .map(|_| Col::<B, BaseField>::zeros(1 << log_size))
        .collect_vec();

    for (row, input) in inputs.iter().enumerate() {
        let mut column = 0;
        let [leaf_left, leaf_right] = input.leaf_values;
        let mut current = algebraic_hash(leaf_left, leaf_right, 1);

        trace[column].set(row, leaf_left);
        column += 1;
        trace[column].set(row, leaf_right);
        column += 1;
        trace[column].set(row, current);
        column += 1;

        for (&sibling, &index) in input.siblings.iter().zip(input.indices.iter()) {
            let index_felt = felt(u32::from(index));
            let (left, right) = if index {
                (sibling, current)
            } else {
                (current, sibling)
            };
            let next = algebraic_hash(left, right, 0);

            trace[column].set(row, sibling);
            column += 1;
            trace[column].set(row, index_felt);
            column += 1;
            trace[column].set(row, left);
            column += 1;
            trace[column].set(row, right);
            column += 1;
            trace[column].set(row, next);
            column += 1;

            current = next;
        }
    }

    let domain = CanonicCoset::new(log_size).circle_domain();
    trace
        .into_iter()
        .map(|eval| CircleEvaluation::<B, _, BitReversedOrder>::new(domain, eval))
        .collect_vec()
}

impl FrameworkEval for MerkleRootEval {
    fn log_size(&self) -> u32 {
        self.statement.log_n_rows
    }

    fn max_constraint_log_degree_bound(&self) -> u32 {
        self.statement.log_n_rows + LOG_CONSTRAINT_DEGREE
    }

    fn evaluate<E: EvalAtRow>(&self, mut eval: E) -> E {
        let leaf_left = eval.next_trace_mask();
        let leaf_right = eval.next_trace_mask();
        let leaf_hash = eval.next_trace_mask();

        eval.add_constraint(leaf_hash.clone() - algebraic_hash_eval::<E>(leaf_left, leaf_right, 1));

        let mut current = leaf_hash;
        for _ in 0..MERKLE_DEPTH {
            let sibling = eval.next_trace_mask();
            let index = eval.next_trace_mask();
            let left = eval.next_trace_mask();
            let right = eval.next_trace_mask();
            let next = eval.next_trace_mask();

            let one = E::F::one();
            eval.add_constraint(index.clone() * (index.clone() - one.clone()));
            eval.add_constraint(
                left.clone()
                    - ((one.clone() - index.clone()) * current.clone()
                        + index.clone() * sibling.clone()),
            );
            eval.add_constraint(
                right.clone()
                    - (index.clone() * current.clone() + (one.clone() - index.clone()) * sibling),
            );
            eval.add_constraint(next.clone() - algebraic_hash_eval::<E>(left, right, 0));

            current = next;
        }

        eval.add_constraint(current - E::F::from(self.statement.expected_root));
        eval
    }
}

pub fn prove_merkle_root(
    inputs: &[MerklePathInput],
    statement: MerkleRootStatement,
    config: PcsConfig,
) -> (MerkleRootComponent, MerkleRootProof) {
    assert_eq!(inputs.len(), 1 << statement.log_n_rows);

    let twiddles = SimdBackend::precompute_twiddles(
        CanonicCoset::new(
            statement.log_n_rows + LOG_CONSTRAINT_DEGREE + config.fri_config.log_blowup_factor,
        )
        .circle_domain()
        .half_coset,
    );

    let prover_channel = &mut Blake2sM31Channel::default();
    statement.mix_into(prover_channel);
    let mut commitment_scheme =
        CommitmentSchemeProver::<SimdBackend, Blake2sM31MerkleChannel>::new(config, &twiddles);

    let mut tree_builder = commitment_scheme.tree_builder();
    tree_builder.extend_evals(vec![]);
    tree_builder.commit(prover_channel);

    let trace = generate_trace::<SimdBackend>(inputs);
    let mut tree_builder = commitment_scheme.tree_builder();
    tree_builder.extend_evals(trace);
    tree_builder.commit(prover_channel);

    let component = MerkleRootComponent::new(
        &mut stwo_constraint_framework::TraceLocationAllocator::default(),
        MerkleRootEval {
            statement: statement.clone(),
        },
        SecureField::zero(),
    );

    let stark_proof = prove::<SimdBackend, Blake2sM31MerkleChannel>(
        &[&component],
        prover_channel,
        commitment_scheme,
    )
    .unwrap();

    (
        component,
        MerkleRootProof {
            statement,
            stark_proof,
        },
    )
}

pub fn verify_merkle_root(
    component: &MerkleRootComponent,
    proof: MerkleRootProof,
) -> Result<(), VerificationError> {
    let config = proof.stark_proof.config;
    let verifier_channel = &mut Blake2sM31Channel::default();
    proof.statement.mix_into(verifier_channel);
    let commitment_scheme = &mut CommitmentSchemeVerifier::<Blake2sM31MerkleChannel>::new(config);
    let sizes = component.trace_log_degree_bounds();

    commitment_scheme.commit(
        proof.stark_proof.commitments[0],
        &sizes[0],
        verifier_channel,
    );
    commitment_scheme.commit(
        proof.stark_proof.commitments[1],
        &sizes[1],
        verifier_channel,
    );
    verify(
        &[component as &dyn Component],
        verifier_channel,
        commitment_scheme,
        proof.stark_proof,
    )
}

#[cfg(test)]
mod tests {
    use itertools::Itertools;
    use num_traits::Zero;
    use stwo::core::fields::qm31::SecureField;
    use stwo::core::fri::FriConfig;
    use stwo::core::pcs::{PcsConfig, TreeVec};
    use stwo::core::poly::circle::CanonicCoset;
    use stwo::prover::backend::simd::SimdBackend;
    use stwo_constraint_framework::{assert_constraints_on_polys, AssertEvaluator, FrameworkEval};

    use super::{
        compute_root, generate_trace, prove_merkle_root, provekit_fixture_input,
        provekit_fixture_root, verify_merkle_root, MerkleRootEval, MerkleRootStatement,
    };

    fn test_config() -> PcsConfig {
        PcsConfig {
            pow_bits: 10,
            fri_config: FriConfig::new(0, 2, 16, 1),
            lifting_log_size: None,
        }
    }

    fn repeated_fixture_inputs(log_n_rows: u32) -> Vec<super::MerklePathInput> {
        vec![provekit_fixture_input(); 1 << log_n_rows]
    }

    #[test]
    fn test_provekit_fixture_root() {
        assert_eq!(
            compute_root(&provekit_fixture_input()),
            provekit_fixture_root()
        );
    }

    #[test]
    fn test_merkle_root_constraints() {
        const LOG_N_ROWS: u32 = 4;
        let statement = MerkleRootStatement {
            log_n_rows: LOG_N_ROWS,
            expected_root: provekit_fixture_root(),
        };
        let traces = TreeVec::new(vec![
            vec![],
            generate_trace::<SimdBackend>(&repeated_fixture_inputs(LOG_N_ROWS)),
        ]);
        let trace_polys =
            traces.map(|trace| trace.into_iter().map(|c| c.interpolate()).collect_vec());

        assert_constraints_on_polys(
            &trace_polys,
            CanonicCoset::new(LOG_N_ROWS),
            |eval: AssertEvaluator<'_>| {
                MerkleRootEval {
                    statement: statement.clone(),
                }
                .evaluate(eval);
            },
            SecureField::zero(),
        );
    }

    #[test]
    #[should_panic]
    fn test_merkle_root_constraints_fail_on_wrong_root() {
        const LOG_N_ROWS: u32 = 4;
        let statement = MerkleRootStatement {
            log_n_rows: LOG_N_ROWS,
            expected_root: provekit_fixture_root() + super::felt(1),
        };
        let traces = TreeVec::new(vec![
            vec![],
            generate_trace::<SimdBackend>(&repeated_fixture_inputs(LOG_N_ROWS)),
        ]);
        let trace_polys =
            traces.map(|trace| trace.into_iter().map(|c| c.interpolate()).collect_vec());

        assert_constraints_on_polys(
            &trace_polys,
            CanonicCoset::new(LOG_N_ROWS),
            |eval: AssertEvaluator<'_>| {
                MerkleRootEval {
                    statement: statement.clone(),
                }
                .evaluate(eval);
            },
            SecureField::zero(),
        );
    }

    #[test_log::test]
    fn test_merkle_root_prove_and_verify() {
        const LOG_N_ROWS: u32 = 4;
        let inputs = repeated_fixture_inputs(LOG_N_ROWS);
        let statement = MerkleRootStatement {
            log_n_rows: LOG_N_ROWS,
            expected_root: provekit_fixture_root(),
        };

        let (component, proof) = prove_merkle_root(&inputs, statement, test_config());
        verify_merkle_root(&component, proof).unwrap();
    }
}
