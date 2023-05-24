import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

import { DepositsProxy, DepositsV2__factory } from "../../typechain-types";

async function deployImplementationV2(deployer: SignerWithAddress) {

    const depositsFactory = await ethers.getContractFactory("DepositsV2", deployer)

    const depositsImplementationV2 = await depositsFactory.deploy()
    await depositsImplementationV2.deployed()

    return depositsImplementationV2
}

function getInitDataForV2(depositFee: BigNumberish = ethers.utils.parseUnits("100", "gwei")) {

    const depositsInterface = new ethers.utils.Interface(DepositsV2__factory.abi)
    const initData = depositsInterface.encodeFunctionData("initializeV2", [depositFee])

    return initData
}

async function updateFromV1ToV2(
    proxy: DepositsProxy,
    proxyOwner: SignerWithAddress,
    v2Address: string,
    depositFee: BigNumberish = ethers.utils.parseUnits("100", "gwei"),
) {
    const initData = getInitDataForV2(depositFee)


    const proxiedImplenetationV1 = await ethers.getContractAt("DepositsV1", proxy.address)
    const upgradeImplentationTx = await proxiedImplenetationV1.connect(proxyOwner).upgradeToAndCall(v2Address, initData)

    return upgradeImplentationTx.wait()
}

function getSecretHash(secretWord: string) {

    const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
    const secretHash = ethers.utils.solidityKeccak256(["bytes32"], [secretWordBytes])

    return secretHash
}

export { deployImplementationV2, getInitDataForV2, updateFromV1ToV2, getSecretHash }