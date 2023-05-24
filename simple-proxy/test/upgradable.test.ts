import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"

import { DepositsProxy, } from "../typechain-types";
import { DepositsV2Errors } from "./utils/constants";
import { deployImplementationV2, getInitDataForV2, getSecretHash, upgradeFromV1ToV2 } from "./utils/helpers";

describe("upgradable", () => {

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress

    let depositsProxy: DepositsProxy

    beforeEach(async () => {

        [ownerAcc, acc2] = await ethers.getSigners()

        const implementationV1Factory = await ethers.getContractFactory("DepositsV1", ownerAcc)
        const implementationV1 = await implementationV1Factory.deploy()
        await implementationV1.deployed()

        const proxyFactory = await ethers.getContractFactory("DepositsProxy", ownerAcc)
        depositsProxy = await proxyFactory.deploy(implementationV1.address, [])
        await depositsProxy.deployed()
    })


    it("Owner can update implementation", async () => {
        const v2Implementation = await deployImplementationV2(ownerAcc)

        await upgradeFromV1ToV2(
            v2Implementation.address,
            depositsProxy,
            ownerAcc
        )

        const implementationAddress = await depositsProxy.implementation()
        expect(implementationAddress).equal(v2Implementation.address)
    })

    it("Non owner cant update implementation", async () => {
        const fakeOwner = acc2

        const v2Implementation = await deployImplementationV2(ownerAcc)
        const initData = getInitDataForV2()

        const updateImplementationTx = depositsProxy.connect(fakeOwner).upgradeToAndCall(v2Implementation.address, initData)
        await expect(updateImplementationTx).to.be.revertedWithoutReason()
    })

    it("Cant init implementation twice", async () => {
        const v2Implementation = await deployImplementationV2(ownerAcc)

        const depositFee = "100"

        await upgradeFromV1ToV2(
            v2Implementation.address,
            depositsProxy,
            ownerAcc,
            depositFee
        )

        const proxiedImplementationV2 = await ethers.getContractAt("DepositsV2", depositsProxy.address)

        const initTx = proxiedImplementationV2.connect(ownerAcc).initialize(depositFee)

        await expect(initTx).to.be.revertedWithCustomError(v2Implementation, DepositsV2Errors.AlreadyInitialized)

    })

    it("New variable attends to proxy after update", async () => {

        const initDepositFee = ethers.utils.parseUnits("200", "gwei")

        const v2Implementation = await deployImplementationV2(ownerAcc)

        await upgradeFromV1ToV2(
            v2Implementation.address,
            depositsProxy,
            ownerAcc,
            initDepositFee
        )

        const proxiedImplementationV2 = await ethers.getContractAt("DepositsV2", depositsProxy.address)

        const depositFee = await proxiedImplementationV2.depositFee()

        expect(depositFee).equal(initDepositFee)
    })

    it("New functional attends to proxy after update", async () => {
        const v2Implementation = await deployImplementationV2(ownerAcc)

        const initDepositFee = ethers.utils.parseUnits("150", "gwei")

        await upgradeFromV1ToV2(
            v2Implementation.address,
            depositsProxy,
            ownerAcc,
            initDepositFee
        )

        const proxiedImplementationV2 = await ethers.getContractAt("DepositsV2", depositsProxy.address)

        const depositFee = await proxiedImplementationV2.depositFee()
        expect(depositFee).equal(initDepositFee)

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")
        const userAcc = acc2

        const secretHash = getSecretHash("1337")

        const depositTx = await proxiedImplementationV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const profitAmount = await proxiedImplementationV2.profitAmount()
        expect(profitAmount).not.equal(0)

        const withdrawProfitTx = await proxiedImplementationV2.connect(ownerAcc).withdrawProfit()

        await expect(withdrawProfitTx).to.changeEtherBalances([ownerAcc, depositsProxy], [profitAmount, profitAmount.mul(-1)])
    })

})