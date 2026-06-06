# Deposit circuit

Use this circuit to build the zk proof in the user device in order to deposit value into the shield pool and generate a new note. This deposit tx will have a public amount and a public sender.

## Run it
To run the circuit, check the README in `packages/circuits/`

## Prover.toml file
```yaml
commitment = "0x0f670b9202f04e3fdd3c9ec53fa427a34ab5a4891be0d257dff327237e34c4d7"
value = 5

[note]
nonce = 0
owner = "0x17aa07f6560b626ccd53cbfb2a0f5b4727b31fb8882ec591a22e7e893c067bd2"
value = 5
```
