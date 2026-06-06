# Deposit circuit

Use this circuit to build the zk proof in the user device in order to deposit value into the shield pool and generate a new note. This deposit tx will have a public amount and a public sender.

## Run it
To run the circuit, check the README in `packages/circuits/`

## Prover.toml file
```yaml
commitment = "0x0e739a82a514f73ef7bf4069c7eaad3d2f9277ee00fa3841d2ab71296c8c9756"
value = 5

[note]
asset  = 5
nonce = 0
owner = "0x17aa07f6560b626ccd53cbfb2a0f5b4727b31fb8882ec591a22e7e893c067bd2"
value = 5
```
