// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./libraries/lib-deposits-v2.sol";

/* added deposit fee functional, fixed reentrancy exploit in withdraw method */

contract DepositsV2 {
    function deposit(bytes32 hashedKey) external payable {
        LibDepositsV2.deposit(hashedKey);
    }

    function withdraw(bytes32 secretWord) external {
        LibDepositsV2.withdraw(secretWord);
    }

    function withdrawProfit() external {
        LibDepositsV2.withdrawProfit();
    }

    function depositFee() external view returns (uint256) {
        return LibDepositsV2.getStorage().depositFee;
    }

    function profitAmount() external view returns (uint256) {
        return LibDepositsV2.getStorage().profitAmount;
    }
}
