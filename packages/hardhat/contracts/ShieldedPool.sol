contract ShieldedPool {
    mapping(bytes32 => bool) public nullifiers;

    uint256 public merkleTree;
}
