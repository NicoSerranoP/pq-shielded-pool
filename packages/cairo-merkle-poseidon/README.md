# Cairo Poseidon Merkle Fixture

This package mirrors `packages/cairo-merkle`, but replaces the toy algebraic hash with Cairo's standard Poseidon hash API:

```cairo
use core::poseidon::poseidon_hash_span;
```

The fixture keeps the same public input shape as the toy Merkle test:

```text
[10 11 20 0 30 1 40 0 50 1]
```

Each hash is domain separated as `[domain, left, right]`, with domain `1` for the leaf pair and `0` for internal nodes.

Expected root for the current fixture:

```text
-845960492790892884656231863041640742943145074470692494761681786972233302565
```

This is still a public test fixture. It is closer to a production primitive than the toy hash, but it is not a privacy claim for shielded transfers.

## Verified Workflow

Tested on 2026-06-06:

- `scarb build`, `scarb test`, and `scarb execute` pass for the public Poseidon Merkle fixture.
- Local `stwo_cairo_prover` proof generation and Rust verification pass with `inputs/stwo_local_params.json`.
- Blake-canonical Cairo-serde proof generation passes with `inputs/stwo_blake_canonical_params.json`.
- Local Cairo recursive verification passes with `stwo_cairo_verifier_array` and `qm31_opcode`.
- Reusable recursive-verifier task PIE validation passes for `target/local-proofs/recursive-verifier-task-pie.zip`.
- Atlantic trace generation passes for the public recursive task PIE on `declaredJobSize=L`.

Key artifacts and values:

- local Poseidon root: `-845960492790892884656231863041640742943145074470692494761681786972233302565`
- local recursive verifier output: `3, -1575579904327646194727519362278749901481907230895578035737745130512097599097, 1, <root>`
- task PIE SHA-256: `17acdc817c1a86310238951fab2840130b835edc0fd3570d52fe2bb94781a890`
- task PIE steps: `19,455,300`
- Atlantic trace query: `01KTDRW5T557A0A4908T1V9QKC`
- Atlantic trace SHARP fact: `0x55255c62a6562c275658d89e4822731edc7f6df44ca71a1b0049b1079cacef45`
- Atlantic real L1 query: `01KTDS2CJV6BTG555N0PSD2K9H`
- Atlantic real L1 completed at: `2026-06-06T07:08:51.187Z`
- Atlantic proof job/transaction id: `01KTDS5NGMSS4W4TMKGRXAFKQ7`
- Sepolia Satellite readback: `valid: true`, `isMocked: false`

Reusable commands:

```sh
source /home/yavor/.bashrc
corepack yarn cairo:merkle-poseidon:build
corepack yarn cairo:merkle-poseidon:test
corepack yarn cairo:merkle-poseidon:prove-local
corepack yarn cairo:merkle-poseidon:prove-recursive
corepack yarn cairo:merkle-poseidon:verify-recursive-local
corepack yarn cairo:merkle-poseidon:build-recursive-task-pie
corepack yarn cairo:merkle-poseidon:check-recursive-task-pie
corepack yarn atlantic:merkle-poseidon:task-pie:dry-run
corepack yarn atlantic:merkle-poseidon:task-pie:trace
corepack yarn atlantic:merkle-poseidon:task-pie:real
corepack yarn atlantic:merkle-poseidon:task-pie:resume-real
```

Use `declaredJobSize=L` for Atlantic. The real L1 job with `declaredJobSize=M` failed at trace generation with `OOMKilled`.
