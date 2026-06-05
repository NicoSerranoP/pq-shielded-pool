## Installing Provekit

In order to use `provekit-cli` you need to install the binary in your machine. Follow these steps (in Linux):

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Install noirup
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
# Clone the repository
git clone https://github.com/worldfnd/provekit

cd provekit
# Build from source
cargo build --release
# Move binary and library to a directory in your PATH
mv <REPO_PATH>/provekit/target/release/provekit-cli $HOME/prove-kit/bin/
mv <REPO_PATH>/provekit/target/release/provekit-cli.d $HOME/prove-kit/bin/
# Make the binary executable
chmod +x $HOME/prove-kit/bin/provekit-cli
# Add the binary to your PATH
echo 'export PATH="$HOME/prove-kit/bin:$PATH"' >> ~/.bashrc
# Reset your terminal or run
source ~/.bashrc
# Test it with
provekit-cli --help
```

## Prepare, prove and verify the circuits

```bash
cd circuits

provekit-cli prepare
provekit-cli prove
provekit-cli verify
```


## Parameters in Prover.toml

`published_root="0x01fc64bed90c55b193ec54e851cd13888d45293f2a2e4efdf83581f39df9c615"`
