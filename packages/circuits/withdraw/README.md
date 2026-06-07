# Withdraw circuit

Use this circuit to build the zk proof in the user device in order to withdraw value from the shielded pool. This withdraw will be totally anonymous for the sender. Receiver will be public and the withdraw amount will be public as well.

## Run it
To run the circuit, check the README in `packages/circuits/`

## Prover.toml file
```yaml
published_root = "0x20a515fe7c855f5887fd8f883cac184945949356f0d12a12835193cbd750c460"
value = 5

[merkle_proof]
indices = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false]
length = 0
siblings = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

[note]
asset = 1
nonce = 0
owner = "0x17aa07f6560b626ccd53cbfb2a0f5b4727b31fb8882ec591a22e7e893c067bd2"
value = 5

```
