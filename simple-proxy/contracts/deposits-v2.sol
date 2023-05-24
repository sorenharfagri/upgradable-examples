// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./deposits-v1.sol";

error AlreadyInitialized();
error NotAnOwner();
error InvalidTxValue();
error ProfitNotFound();

/* added deposit fee functional, fixed reentrancy exploit in withdraw method */

contract DepositsV2 is DepositsV1 {
    uint256 internal version;
    uint256 public depositFee;
    uint256 public profitAmount;

    function initialize(uint256 _depositFee) public {
        if (version >= 2) revert AlreadyInitialized();

        version = 2;
        depositFee = _depositFee;
    }

    function deposit(bytes32 hashedKey) external payable virtual override {
        if (msg.value <= depositFee) revert InvalidTxValue();
        if (deposits[hashedKey] != 0) revert DepositAlreadyExists();

        profitAmount += depositFee;
        deposits[hashedKey] = msg.value - depositFee;
    }

    function withdraw(bytes32 secretWord) external virtual override {
        bytes32 hashedKey = keccak256(abi.encodePacked(secretWord));

        uint256 depositAmount = deposits[hashedKey];

        if (depositAmount == 0) revert DepositNotFound();

        delete deposits[hashedKey];

        (bool success, ) = msg.sender.call{value: depositAmount}("");

        if (success != true) revert FailedToSendEther();
    }

    function withdrawProfit() external {
        if (tx.origin != owner) revert NotAnOwner();
        if (profitAmount == 0) revert ProfitNotFound();

        uint256 amountToSend = profitAmount;

        profitAmount = 0;

        (bool success, ) = msg.sender.call{value: amountToSend}("");

        if (success != true) revert FailedToSendEther();
    }
}
