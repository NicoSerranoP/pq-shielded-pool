// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { InternalLeanIMT, LeanIMTData } from "@zk-kit/lean-imt.sol/InternalLeanIMT.sol";
import { BucketedNullifierSet } from "./BucketedNullifierSet.sol";

/// @notice Generated deposit verifier interface.
/// @dev Current generated public inputs are `[commitment, amount]`.
interface IDepositVerifier {
    function verifyProof(bytes calldata proof, uint256[2] calldata publicInputs) external view;
}

/// @notice Generated transfer verifier interface.
/// @dev Current generated public inputs are `[inputNullifier, output0, output1, root]`.
interface ITransferVerifier {
    function verifyProof(bytes calldata proof, uint256[4] calldata publicInputs) external view;
}

/// @notice Generated withdrawal verifier interface.
/// @dev Current generated public inputs are `[amount, root]`.
interface IWithdrawVerifier {
    function verifyProof(bytes calldata proof, uint256[2] calldata publicInputs) external view;
}

/// @notice Shielded pool using a Lean Incremental Merkle Tree.
contract ShieldedPool is ReentrancyGuard, BucketedNullifierSet {
    using InternalLeanIMT for LeanIMTData;
    using SafeERC20 for IERC20;

    uint256 public constant ROOT_HISTORY_SIZE = 100;
    uint256 public constant TRANSFER_OUTPUT_COMMITMENT_COUNT = 2;

    IERC20 public immutable token;
    IDepositVerifier public immutable depositVerifier;
    ITransferVerifier public immutable transferVerifier;
    IWithdrawVerifier public immutable withdrawVerifier;
    uint256 public immutable assetId;

    LeanIMTData private _commitmentTree;
    mapping(uint256 root => bool known) private _knownRoots;
    uint256[ROOT_HISTORY_SIZE] private _rootHistory;
    uint256 private _rootHistoryIndex;

    error InvalidToken();
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
    error InvalidOutputCommitmentCount();
    error InvalidNullifier();
    error NullifierAlreadySpent(uint256 nullifier);
    error InvalidOutputCommitment();
    error InvalidRootHistoryIndex();
    error TokenTransferAmountMismatch();

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
        IERC20 token_,
        IDepositVerifier depositVerifier_,
        ITransferVerifier transferVerifier_,
        IWithdrawVerifier withdrawVerifier_,
        uint256 assetId_
    ) {
        if (address(token_) == address(0)) {
            revert InvalidToken();
        }

        if (address(depositVerifier_) == address(0)) {
            revert InvalidDepositVerifier();
        }

        if (address(transferVerifier_) == address(0)) {
            revert InvalidTransferVerifier();
        }

        if (address(withdrawVerifier_) == address(0)) {
            revert InvalidWithdrawVerifier();
        }

        if (assetId_ == 0) {
            revert InvalidAssetId();
        }

        token = token_;
        depositVerifier = depositVerifier_;
        transferVerifier = transferVerifier_;
        withdrawVerifier = withdrawVerifier_;
        assetId = assetId_;
    }

    /// @notice Deposit tokens into the pool and append a private note commitment.
    /// @param amount The public ERC20 amount transferred into the pool.
    /// @param depositAssetId The public asset id this note represents.
    /// @param commitment The note commitment inserted as a LeanIMT leaf.
    /// @param zkProof A proof that matches the generated deposit verifier public inputs.
    /// @return leafIndex The inserted commitment's tree index.
    /// @return newRoot The Merkle root after insertion.
    function deposit(
        uint256 amount,
        uint256 depositAssetId,
        uint256 commitment,
        bytes calldata zkProof
    ) external nonReentrant returns (uint256 leafIndex, uint256 newRoot) {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (depositAssetId != assetId) {
            revert InvalidAssetId();
        }

        _verifyDepositProof(amount, commitment, zkProof);

        uint256 balanceBefore = token.balanceOf(address(this));

        token.safeTransferFrom(msg.sender, address(this), amount);

        if (token.balanceOf(address(this)) - balanceBefore != amount) {
            revert TokenTransferAmountMismatch();
        }

        leafIndex = _commitmentTree.size;
        newRoot = _commitmentTree._insert(commitment);
        _rememberRoot(newRoot);

        emit Deposit(msg.sender, depositAssetId, leafIndex, amount, commitment, newRoot);
    }

    /// @notice Spend private input notes and append private output note commitments.
    /// @param root An accepted Merkle root containing the private input commitments.
    /// @param inputNullifier Nullifier for the note consumed by this transfer.
    /// @param outputCommitments Dynamic output note commitments, e.g. recipient plus change.
    /// @param zkProof A proof of inclusion, nullifier correctness, and value conservation.
    /// @return firstLeafIndex The tree index of the first inserted output commitment.
    /// @return newRoot The Merkle root after all output commitments are inserted.
    function transfer(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata zkProof
    ) external nonReentrant returns (uint256 firstLeafIndex, uint256 newRoot) {
        if (!_knownRoots[root]) {
            revert UnknownMerkleRoot();
        }

        if (inputNullifier == 0) {
            revert InvalidNullifier();
        }

        if (outputCommitments.length == 0) {
            revert NoOutputCommitments();
        }

        if (outputCommitments.length != TRANSFER_OUTPUT_COMMITMENT_COUNT) {
            revert InvalidOutputCommitmentCount();
        }

        _verifyOutputCommitments(outputCommitments);
        _verifyTransferProof(root, inputNullifier, outputCommitments, zkProof);

        _spendNullifier(inputNullifier);

        firstLeafIndex = _commitmentTree.size;
        newRoot = _insertOutputCommitments(outputCommitments);
        _rememberRoot(newRoot);

        emit Transfer(root, firstLeafIndex, newRoot, inputNullifier, outputCommitments);
    }

    /// @notice Spend a private input note and withdraw public ERC20 tokens.
    /// @param root An accepted Merkle root containing the private input commitment.
    /// @param inputNullifier Nullifier for the note consumed by this withdrawal.
    /// @param recipient Public recipient that receives withdrawn tokens.
    /// @param amount Public ERC20 amount withdrawn from the pool.
    /// @param zkProof A proof that matches the generated withdrawal verifier public inputs.
    function withdraw(
        uint256 root,
        uint256 inputNullifier,
        address recipient,
        uint256 amount,
        bytes calldata zkProof
    ) external nonReentrant {
        if (!_knownRoots[root]) {
            revert UnknownMerkleRoot();
        }

        if (inputNullifier == 0) {
            revert InvalidNullifier();
        }

        if (recipient == address(0)) {
            revert InvalidRecipient();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        _verifyWithdrawProof(root, amount, zkProof);

        _spendNullifier(inputNullifier);
        token.safeTransfer(recipient, amount);

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
        if (index >= ROOT_HISTORY_SIZE) {
            revert InvalidRootHistoryIndex();
        }

        return _rootHistory[index];
    }

    function _spendNullifier(uint256 nullifier) private {
        if (nullifier == 0) {
            revert InvalidNullifier();
        }

        if (contains(nullifier)) {
            revert NullifierAlreadySpent(nullifier);
        }

        _pushNullifier(nullifier);
    }

    function _verifyDepositProof(uint256 amount, uint256 commitment, bytes calldata proof) private view {
        uint256[2] memory publicInputs = [commitment, amount];

        try depositVerifier.verifyProof(proof, publicInputs) {}
        catch {
            revert InvalidDepositProof();
        }
    }

    function _verifyTransferProof(
        uint256 root,
        uint256 inputNullifier,
        uint256[] calldata outputCommitments,
        bytes calldata proof
    ) private view {
        uint256[4] memory publicInputs = [
            inputNullifier,
            outputCommitments[0],
            outputCommitments[1],
            root
        ];

        try transferVerifier.verifyProof(proof, publicInputs) {}
        catch {
            revert InvalidTransferProof();
        }
    }

    function _verifyWithdrawProof(uint256 root, uint256 amount, bytes calldata proof) private view {
        uint256[2] memory publicInputs = [amount, root];

        try withdrawVerifier.verifyProof(proof, publicInputs) {}
        catch {
            revert InvalidWithdrawProof();
        }
    }

    function _verifyOutputCommitments(uint256[] calldata outputCommitments) private pure {
        for (uint256 i = 0; i < outputCommitments.length; ) {
            if (outputCommitments[i] == 0) {
                revert InvalidOutputCommitment();
            }

            unchecked {
                ++i;
            }
        }
    }

    function _insertOutputCommitments(uint256[] calldata outputCommitments) private returns (uint256 root) {
        for (uint256 i = 0; i < outputCommitments.length; ) {
            uint256 commitment = outputCommitments[i];

            if (commitment == 0) {
                revert InvalidOutputCommitment();
            }

            root = _commitmentTree._insert(commitment);

            unchecked {
                ++i;
            }
        }
    }

    function _rememberRoot(uint256 root) private {
        uint256 oldRoot = _rootHistory[_rootHistoryIndex];

        if (oldRoot != 0) {
            _knownRoots[oldRoot] = false;
        }

        _rootHistory[_rootHistoryIndex] = root;
        _knownRoots[root] = true;
        _rootHistoryIndex = (_rootHistoryIndex + 1) % ROOT_HISTORY_SIZE;
    }
}
