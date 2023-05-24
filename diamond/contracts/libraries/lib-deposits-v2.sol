// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./lib-deposits-v1.sol";
import "./lib-diamond.sol";

library LibDepositsV2 {
    error InvalidTxValue();
    error ProfitNotFound();
    error NotAnOwner();

    bytes32 constant DEPOSITS_V2_STORAGE_POSITION =
        keccak256("deposits-v2.storage");

    struct DepositsV2Storage {
        uint256 depositFee;
        uint256 profitAmount;
    }

    function getStorage() internal pure returns (DepositsV2Storage storage ds) {
        bytes32 position = DEPOSITS_V2_STORAGE_POSITION;
        assembly {
            ds.slot := position
        }
    }

    function deposit(bytes32 hashedKey) internal {
        DepositsV2Storage storage depositsV2Storage = getStorage();

        if (msg.value <= depositsV2Storage.depositFee) revert InvalidTxValue();

        LibDepositsV1.DepositsV1Storage
            storage depositsV1Storage = LibDepositsV1.getStorage();

        if (depositsV1Storage.deposits[hashedKey] != 0)
            revert LibDepositsV1.DepositAlreadyExists();

        depositsV2Storage.profitAmount += depositsV2Storage.depositFee;

        depositsV1Storage.deposits[hashedKey] =
            msg.value -
            depositsV2Storage.depositFee;
    }

    function withdraw(bytes32 secretWord) internal {
        bytes32 hashedKey = keccak256(abi.encodePacked(secretWord));

        LibDepositsV1.DepositsV1Storage
            storage depositsV1Storage = LibDepositsV1.getStorage();

        uint256 depositAmount = depositsV1Storage.deposits[hashedKey];

        if (depositAmount == 0) revert LibDepositsV1.DepositNotFound();

        delete depositsV1Storage.deposits[hashedKey];

        (bool success, ) = msg.sender.call{value: depositAmount}("");

        if (success != true) revert LibDepositsV1.FailedToSendEther();
    }

    function withdrawProfit() internal {
        if (LibDiamond.contractOwner() != msg.sender) revert NotAnOwner();

        DepositsV2Storage storage depositsV2Storage = getStorage();

        if (depositsV2Storage.profitAmount == 0) revert ProfitNotFound();

        uint256 amountToSend = depositsV2Storage.profitAmount;

        depositsV2Storage.profitAmount = 0;

        (bool success, ) = msg.sender.call{value: amountToSend}("");

        if (success != true) revert LibDepositsV1.FailedToSendEther();
    }
}
