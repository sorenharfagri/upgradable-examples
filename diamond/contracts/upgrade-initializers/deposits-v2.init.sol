// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../libraries/lib-deposits-v2.sol";

contract DepositsV2Init {
    function init(uint256 depositFee) external {
        LibDepositsV2.DepositsV2Storage
            storage depositsV2Storage = LibDepositsV2.getStorage();

        depositsV2Storage.depositFee = depositFee;
    }
}
