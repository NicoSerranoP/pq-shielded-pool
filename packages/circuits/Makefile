.PHONY: all build prepare prove solidity calldata clean

# Path to the cloned provekit source (needed for the Solidity template).
# Default matches `git clone https://github.com/worldfnd/provekit` run from $HOME.
# Override if you cloned elsewhere: make PROVEKIT_SRC=/other/path
PROVEKIT_SRC   ?= $(HOME)/provekit

TEMPLATE        := $(PROVEKIT_SRC)/provekit/groth16/contracts/ProvekitGroth16Verifier.sol
PKP_FILE        := circuits.pkp
PKV_FILE        := circuits.pkv
PROOF_FILE      := proof.np
VERIFIER_SOL    := ../hardhat/contracts/Verifier.sol
CALLDATA_DIR    := artifacts/calldata
PROOF_HEX       := $(CALLDATA_DIR)/proof.hex

all: solidity

# Step 0: Compile the Noir circuit.
target/circuits.json: src/main.nr Nargo.toml
	nargo build

build: target/circuits.json

# Step 1: Compile R1CS + run Groth16 trusted setup.
$(PKV_FILE): target/circuits.json
	provekit-cli prepare target/circuits.json --backend groth16

prepare: $(PKV_FILE)

# Step 2: Generate a Groth16 proof from Prover.toml inputs.
$(PROOF_FILE): $(PKV_FILE) Prover.toml
	provekit-cli prove

prove: $(PROOF_FILE)

# Step 3: Emit a circuit-specific Solidity verifier from the VK.
$(VERIFIER_SOL): $(PKV_FILE) $(TEMPLATE)
	provekit-cli export-solidity \
		--pkv $(PKV_FILE) \
		--template $(TEMPLATE) \
		--out $(VERIFIER_SOL)

solidity: $(VERIFIER_SOL)

# Step 4: Export EVM calldata (proof.hex + inputs.txt) for contract tests.
$(PROOF_HEX): $(PROOF_FILE)
	mkdir -p $(CALLDATA_DIR)
	provekit-cli export-evm-proof \
		--proof $(PROOF_FILE) \
		--out-dir $(CALLDATA_DIR)

calldata: $(PROOF_HEX)

clean:
	rm -rf $(PKP_FILE) $(PKV_FILE) $(PROOF_FILE) \
	       $(VERIFIER_SOL) $(CALLDATA_DIR)
