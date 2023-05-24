// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/proxy/Proxy.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract DepositsProxy is ERC1967Proxy {
    constructor(
        address _implementation,
        bytes memory _initData
    ) ERC1967Proxy(_implementation, _initData) {}

    function implementation() public view returns (address) {
        return _implementation();
    }
}
