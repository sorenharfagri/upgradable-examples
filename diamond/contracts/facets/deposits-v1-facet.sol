// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

error ZeroTxValue();
error DepositNotFound();
error DepositAlreadyExists();
error FailedToSendEther();

/* this version has reentrancy exploit in withdraw method */

contract DepositsV1Facet {
    mapping(bytes32 => uint256) public deposits;

    function deposit(bytes32 hashedSecret) external payable virtual {
        if (msg.value == 0) revert ZeroTxValue();
        if (deposits[hashedSecret] != 0) revert DepositAlreadyExists();

        deposits[hashedSecret] = msg.value;
    }

    function withdraw(bytes32 secretWord) external virtual {
        bytes32 hashedKey = keccak256(abi.encodePacked(secretWord));

        uint256 depositAmount = deposits[hashedKey];

        if (depositAmount == 0) revert DepositNotFound();

        /* reentrancy possibility xdd */
        (bool success, ) = msg.sender.call{value: depositAmount}("");

        delete deposits[hashedKey];

        if (success != true) revert FailedToSendEther();
    }
}
