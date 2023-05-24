// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

error NotAnOwner();
error FailedToInit();

contract DepositsProxy {
    address public owner;
    address public implementation;

    constructor(address _imp, bytes memory _impInitData) {
        owner = msg.sender;
        upgradeToAndCall(_imp, _impInitData);
    }

    function _delegate(address _imp) internal virtual {
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.

            // calldatacopy(t, f, s) - copy s bytes from calldata at position f to mem at position t
            // calldatasize() - size of call data in bytes
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.

            // delegatecall(g, a, in, insize, out, outsize) -
            // - call contract at address a
            // - with input mem[in…(in+insize))
            // - providing g gas
            // - and output area mem[out…(out+outsize))
            // - returning 0 on error (eg. out of gas) and 1 on success
            let result := delegatecall(gas(), _imp, 0, calldatasize(), 0, 0)

            // Copy the returned data.
            // returndatacopy(t, f, s) - copy s bytes from returndata at position f to mem at position t
            // returndatasize() - size of the last returndata
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {
                // revert(p, s) - end execution, revert state changes, return data mem[p…(p+s))
                revert(0, returndatasize())
            }
            default {
                // return(p, s) - end execution, return data mem[p…(p+s))
                return(0, returndatasize())
            }
        }
    }

    function upgradeToAndCall(
        address _implementation,
        bytes memory _initData
    ) public returns (bytes memory) {
        if (msg.sender != owner) _delegate(implementation);

        implementation = _implementation;

        if (_initData.length > 0) {
            (bool success, bytes memory returnData) = implementation
                .delegatecall(_initData);

            if (!success) revert FailedToInit();

            return returnData;
        }
    }

    fallback() external payable {
        _delegate(implementation);
    }

    receive() external payable {
        _delegate(implementation);
    }
}
