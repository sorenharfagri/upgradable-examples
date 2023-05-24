// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

error NotAnOwner();
error FailedToInit();

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract DepositsProxy is TransparentUpgradeableProxy {

    constructor(
        address _implementation,
        bytes memory _impInitData,
        address proxyAdmin
    ) TransparentUpgradeableProxy(_implementation, proxyAdmin, _impInitData) {}
    
}
