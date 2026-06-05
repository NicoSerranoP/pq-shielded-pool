// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {InternalLeanIMT, LeanIMTData} from "@zk-kit/lean-imt.sol/InternalLeanIMT.sol";

/// @notice Verifier contract for deposit note well-formedness proofs.
/// @dev The generated zk verifier should prove that `commitment` commits to the
/// public `amount` and `assetId` plus hidden note owner data and randomness.
interface IDepositVerifier {
    function verifyDepositProof(
        uint256 amount,
        uint256 assetId,
        uint256 commitment,
        bytes calldata proof
    ) external view returns (bool);
}

/// @notice Deposit-only shielded pool using a Lean Incremental Merkle Tree.
contract ShieldedPool is ReentrancyGuard {
    using InternalLeanIMT for LeanIMTData;
    using SafeERC20 for IERC20;

    uint256 public constant ROOT_HISTORY_SIZE = 100;

    IERC20 public immutable token;
    IDepositVerifier public immutable depositVerifier;
    uint256 public immutable assetId;

    LeanIMTData private _commitmentTree;
    mapping(uint256 root => bool known) private _knownRoots;
    uint256[ROOT_HISTORY_SIZE] private _rootHistory;
    uint256 private _rootHistoryIndex;

    error InvalidToken();
    error InvalidDepositVerifier();
    error InvalidAssetId();
    error InvalidAmount();
    error InvalidDepositProof();
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

    constructor(
        IERC20 token_,
        IDepositVerifier depositVerifier_,
        uint256 assetId_
    ) {
        if (address(token_) == address(0)) {
            revert InvalidToken();
        }

        if (address(depositVerifier_) == address(0)) {
            revert InvalidDepositVerifier();
        }

        if (assetId_ == 0) {
            revert InvalidAssetId();
        }

        token = token_;
        depositVerifier = depositVerifier_;
        assetId = assetId_;
    }

    /// @notice Deposit tokens into the pool and append a private note commitment.
    /// @param amount The public ERC20 amount transferred into the pool.
    /// @param depositAssetId The public asset id this note represents.
    /// @param commitment The note commitment inserted as a LeanIMT leaf.
    /// @param zkProof A proof that the commitment is well-formed for amount and asset id.
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

        if (
            !depositVerifier.verifyDepositProof(
                amount,
                depositAssetId,
                commitment,
                zkProof
            )
        ) {
            revert InvalidDepositProof();
        }

        uint256 balanceBefore = token.balanceOf(address(this));

        token.safeTransferFrom(msg.sender, address(this), amount);

        if (token.balanceOf(address(this)) - balanceBefore != amount) {
            revert TokenTransferAmountMismatch();
        }

        leafIndex = _commitmentTree.size;
        newRoot = _commitmentTree._insert(commitment);
        _rememberRoot(newRoot);

        emit Deposit(
            msg.sender,
            depositAssetId,
            leafIndex,
            amount,
            commitment,
            newRoot
        );
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

    function rootHistoryIndex() external view returns (uint256) {
        return _rootHistoryIndex;
    }

    function rootHistory(uint256 index) external view returns (uint256) {
        if (index >= ROOT_HISTORY_SIZE) {
            revert InvalidRootHistoryIndex();
        }

        return _rootHistory[index];
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
