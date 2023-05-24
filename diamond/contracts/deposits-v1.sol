// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./libraries/lib-deposits-v1.sol";

/* this version has reentrancy exploit in withdraw method */

contract DepositsV1 {
    function deposit(bytes32 hashedSecret) external payable {
        LibDepositsV1.deposit(hashedSecret);
    }

    function withdraw(bytes32 secretWord) external {
        LibDepositsV1.withdraw(secretWord);
    }

    function getDeposit(bytes32 hashedSecret) external view returns (uint256) {
        return LibDepositsV1.getStorage().deposits[hashedSecret];
    }
}
