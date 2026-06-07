## Installing Provekit

In order to use `provekit-cli` you need to install the binary in your machine. Follow these steps (in Linux):

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Install noirup
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
# Install specific noir version compatible with Provekit
noirup --version v1.0.0-beta.19
# Clone the repository
git clone https://github.com/worldfnd/provekit

cd provekit
# Build from source
cargo build --release
# Build provekit-cli
cargo build -p provekit-cli --release
# Create a directory for the binary
mkdir -p "$HOME/prove-kit/bin"
# Move binary and library to a directory in your PATH
mv /target/release/provekit-cli $HOME/prove-kit/bin/
mv /target/release/provekit-cli.d $HOME/prove-kit/bin/
# Make the binary executable
chmod +x $HOME/prove-kit/bin/provekit-cli
# Add the binary to your PATH
echo 'export PATH="$HOME/prove-kit/bin:$PATH"' >> ~/.bashrc
# Reset your terminal or run
source ~/.bashrc
# Test it with
provekit-cli --help
```

## EVM proof export

The checked-in `deposit`, `transfer`, and `withdraw` EVM fixtures are Groth16-wrapped artifacts:

- `packages/circuits/<ACTION_CIRCUIT>/Verifier.sol`
- `packages/circuits/<ACTION_CIRCUIT>/evm/proof.hex`
- `packages/circuits/<ACTION_CIRCUIT>/evm/inputs.txt`

Some Provekit builds expose only `prepare`, `prove`, and `verify`. To regenerate EVM artifacts, use a build that also exposes `export-solidity` and `export-evm-proof`; `origin/rs/verifying_contract` at commit `dd237e54` was verified locally for fresh deposit EVM proof export.

```bash
git clone https://github.com/worldfnd/provekit /tmp/provekit-evm-export
cd /tmp/provekit-evm-export
git checkout rs/verifying_contract
cargo build --release -p provekit-cli
cd /path/to/pq-shielded-pool
PROVEKIT_CLI=/tmp/provekit-evm-export/target/release/provekit-cli yarn circuits:evm
```

`yarn circuits:evm` regenerates all three circuit EVM artifacts and syncs the renamed verifier contracts into `packages/hardhat/contracts/generated`. Groth16 setup is randomized, so verifier and proof diffs are expected.

## Prepare, prove and verify the circuits (only Provekit)
```bash
cd packages/circuits/<ACTION_CIRCUIT>

provekit-cli prepare
provekit-cli prove
provekit-cli verify
```


## Prepare, prove and verify the circuits (Provekit wrapped in Groth16)
```bash
cd packages/circuits
nargo build

cd <ACTION_CIRCUIT>

provekit-cli prepare ../target/<ACTION_CIRCUIT>.json --backend groth16

provekit-cli export-solidity --pkv <ACTION_CIRCUIT>.pkv --template ../ProvekitGroth16Verifier.sol --out Verifier.sol

provekit-cli prove

provekit-cli export-evm-proof --proof proof.np --out-dir evm
```
