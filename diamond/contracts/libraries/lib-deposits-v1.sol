// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibDepositsV1 {
    error ZeroTxValue();
    error DepositNotFound();
    error DepositAlreadyExists();
    error FailedToSendEther();

    bytes32 constant DEPOSITS_V1_STORAGE_POSITION =
        keccak256("deposits-v1.storage");

    struct DepositsV1Storage {
        mapping(bytes32 => uint256) deposits;
    }

    function getStorage() internal pure returns (DepositsV1Storage storage ds) {
        bytes32 position = DEPOSITS_V1_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    function deposit(bytes32 hashedSecret) internal {
        if (msg.value == 0) revert ZeroTxValue();

        DepositsV1Storage storage depositsV1Storage = LibDepositsV1
            .getStorage();

        if (depositsV1Storage.deposits[hashedSecret] != 0)
            revert DepositAlreadyExists();

        depositsV1Storage.deposits[hashedSecret] = msg.value;
    }

    function withdraw(bytes32 secretWord) internal {
        bytes32 hashedKey = keccak256(abi.encodePacked(secretWord));

        DepositsV1Storage storage depositsV1Storage = LibDepositsV1
            .getStorage();

        uint256 depositAmount = depositsV1Storage.deposits[hashedKey];

        if (depositAmount == 0) revert DepositNotFound();

        /* reentrancy possibility xdd */
        (bool success, ) = msg.sender.call{value: depositAmount}("");

        delete depositsV1Storage.deposits[hashedKey];

        if (success != true) revert FailedToSendEther();
    }
}
