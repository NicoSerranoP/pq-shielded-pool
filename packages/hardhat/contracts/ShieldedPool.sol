// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { InternalLeanIMT, LeanIMTData } from "@zk-kit/lean-imt.sol/InternalLeanIMT.sol";
import { BucketedNullifierSet } from "./BucketedNullifierSet.sol";

/// @notice Verifier contract for deposit note well-formedness proofs.
interface IDepositVerifier {
    function verifyDepositProof(
        uint256 amount,
        uint256 assetId,
        uint256 commitment,
        bytes calldata proof
    ) external view returns (bool);
}

/// @notice Verifier contract for private transfer proofs.
interface ITransferVerifier {
    function verifyTransferProof(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata proof
    ) external view returns (bool);
}

/// @notice Verifier contract for private withdrawal proofs.
interface IWithdrawVerifier {
    function verifyWithdrawProof(
        uint256 root,
        uint256 inputNullifier,
        address recipient,
        uint256 amount,
        bytes calldata proof
    ) external view returns (bool);
}

/// @notice Shielded pool using a Lean Incremental Merkle Tree.
contract ShieldedPool is ReentrancyGuard, BucketedNullifierSet {
    using InternalLeanIMT for LeanIMTData;

    uint256 public constant ROOT_HISTORY_SIZE = 100;

    IDepositVerifier public immutable depositVerifier;
    ITransferVerifier public immutable transferVerifier;
    IWithdrawVerifier public immutable withdrawVerifier;
    uint256 public immutable assetId;

    LeanIMTData private _commitmentTree;
    mapping(uint256 root => bool known) private _knownRoots;
    uint256[ROOT_HISTORY_SIZE] private _rootHistory;
    uint256 private _rootHistoryIndex;

    error InvalidDepositVerifier();
    error InvalidTransferVerifier();
    error InvalidWithdrawVerifier();
    error InvalidAssetId();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidDepositProof();
    error InvalidTransferProof();
    error InvalidWithdrawProof();
    error UnknownMerkleRoot();
    error NoOutputCommitments();
    error InvalidNullifier();
    error NullifierAlreadySpent(uint256 nullifier);
    error InvalidOutputCommitment();
    error InvalidRootHistoryIndex();
    error EthTransferFailed();

    event Deposit(
        address indexed depositor,
        uint256 indexed assetId,
        uint256 indexed leafIndex,
        uint256 amount,
        uint256 commitment,
        uint256 root
    );

    event Transfer(
        uint256 indexed oldRoot,
        uint256 indexed firstLeafIndex,
        uint256 indexed newRoot,
        uint256 inputNullifier,
        uint256[] outputCommitments
    );

    event Withdrawal(uint256 indexed root, uint256 indexed inputNullifier, address indexed recipient, uint256 amount);

    constructor(
        IDepositVerifier depositVerifier_,
        ITransferVerifier transferVerifier_,
        IWithdrawVerifier withdrawVerifier_,
        uint256 assetId_
    ) {
        if (address(depositVerifier_) == address(0)) revert InvalidDepositVerifier();
        if (address(transferVerifier_) == address(0)) revert InvalidTransferVerifier();
        if (address(withdrawVerifier_) == address(0)) revert InvalidWithdrawVerifier();
        if (assetId_ == 0) revert InvalidAssetId();

        depositVerifier = depositVerifier_;
        transferVerifier = transferVerifier_;
        withdrawVerifier = withdrawVerifier_;
        assetId = assetId_;
    }

    function deposit(
        uint256 amount,
        uint256 depositAssetId,
        uint256 commitment,
        bytes calldata zkProof
    ) external payable nonReentrant returns (uint256 leafIndex, uint256 newRoot) {
        if (amount == 0) revert InvalidAmount();
        if (msg.value != amount) revert InvalidAmount();
        if (depositAssetId != assetId) revert InvalidAssetId();
        if (!depositVerifier.verifyDepositProof(amount, depositAssetId, commitment, zkProof)) revert InvalidDepositProof();

        leafIndex = _commitmentTree.size;
        newRoot = _commitmentTree._insert(commitment);
        _rememberRoot(newRoot);

        emit Deposit(msg.sender, depositAssetId, leafIndex, amount, commitment, newRoot);
    }

    function transfer(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata zkProof
    ) external nonReentrant returns (uint256 firstLeafIndex, uint256 newRoot) {
        if (!_knownRoots[root]) revert UnknownMerkleRoot();
        if (inputNullifier == 0) revert InvalidNullifier();
        if (outputCommitments.length == 0) revert NoOutputCommitments();
        if (!transferVerifier.verifyTransferProof(root, inputNullifier, outputCommitments, zkProof)) revert InvalidTransferProof();

        _spendNullifier(inputNullifier);

        firstLeafIndex = _commitmentTree.size;
        newRoot = _insertOutputCommitments(outputCommitments);
        _rememberRoot(newRoot);

        emit Transfer(root, firstLeafIndex, newRoot, inputNullifier, outputCommitments);
    }

    function withdraw(
        uint256 root,
        uint256 inputNullifier,
        address recipient,
        uint256 amount,
        bytes calldata zkProof
    ) external nonReentrant {
        if (!_knownRoots[root]) revert UnknownMerkleRoot();
        if (inputNullifier == 0) revert InvalidNullifier();
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (!withdrawVerifier.verifyWithdrawProof(root, inputNullifier, recipient, amount, zkProof)) revert InvalidWithdrawProof();

        _spendNullifier(inputNullifier);
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert EthTransferFailed();

        emit Withdrawal(root, inputNullifier, recipient, amount);
    }

    function currentRoot() external view returns (uint256) {
        return _commitmentTree._root();
    }

    function treeSize() external view returns (uint256) {
        return _commitmentTree.size;
    }

    function treeDepth() external view returns (uint256) {
        return _commitmentTree.depth;
    }

    function hasCommitment(uint256 commitment) external view returns (bool) {
        return _commitmentTree._has(commitment);
    }

    function commitmentIndex(uint256 commitment) external view returns (uint256) {
        return _commitmentTree._indexOf(commitment);
    }

    function isKnownRoot(uint256 root) external view returns (bool) {
        return _knownRoots[root];
    }

    function isNullifierSpent(uint256 nullifier) external view returns (bool) {
        return contains(nullifier);
    }

    function rootHistoryIndex() external view returns (uint256) {
        return _rootHistoryIndex;
    }

    function rootHistory(uint256 index) external view returns (uint256) {
        if (index >= ROOT_HISTORY_SIZE) revert InvalidRootHistoryIndex();
        return _rootHistory[index];
    }

    function _spendNullifier(uint256 nullifier) private {
        if (nullifier == 0) revert InvalidNullifier();
        if (contains(nullifier)) revert NullifierAlreadySpent(nullifier);
        _pushNullifier(nullifier);
    }

    function _insertOutputCommitments(uint256[] calldata outputCommitments) private returns (uint256 root) {
        for (uint256 i = 0; i < outputCommitments.length; ) {
            uint256 commitment = outputCommitments[i];
            if (commitment == 0) revert InvalidOutputCommitment();
            root = _commitmentTree._insert(commitment);
            unchecked { ++i; }
        }
    }

    function _rememberRoot(uint256 root) private {
        uint256 oldRoot = _rootHistory[_rootHistoryIndex];
        if (oldRoot != 0) _knownRoots[oldRoot] = false;
        _rootHistory[_rootHistoryIndex] = root;
        _knownRoots[root] = true;
        _rootHistoryIndex = (_rootHistoryIndex + 1) % ROOT_HISTORY_SIZE;
    }
}
