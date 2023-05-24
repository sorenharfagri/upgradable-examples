import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"

import { DepositsProxy, ProxyAdmin } from "../typechain-types";
import { deployImplementationV2, getInitDataForV2, getSecretHash, updateFromV1ToV2 } from "./utils/helpers";

describe("upgradable", () => {

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress

    let proxyAdmin: ProxyAdmin
    let depositsProxy: DepositsProxy

    beforeEach(async () => {

        [ownerAcc, acc2] = await ethers.getSigners()

        const implementationV1Factory = await ethers.getContractFactory("DepositsV1", ownerAcc)
        const implementationV1 = await implementationV1Factory.deploy()
        await implementationV1.deployed()

        const proxyAdminFactory = await ethers.getContractFactory("DepositsProxyAdmin", ownerAcc)
        proxyAdmin = await proxyAdminFactory.deploy()
        await proxyAdmin.deployed()

        const proxyFactory = await ethers.getContractFactory("DepositsProxy", ownerAcc)
        depositsProxy = await proxyFactory.deploy(implementationV1.address, [], proxyAdmin.address)
        await depositsProxy.deployed()
    })


    it("Owner can update implementation", async () => {
        const v2Implementation = await deployImplementationV2(ownerAcc)

        await updateFromV1ToV2(
            depositsProxy,
            proxyAdmin,
            ownerAcc,
            v2Implementation.address
        )

        const implementationAddress = await proxyAdmin.connect(ownerAcc).getProxyImplementation(depositsProxy.address)
        expect(implementationAddress).equal(v2Implementation.address)
    })

    it("Non owner cant update implementation", async () => {
        const fakeOwner = acc2

        const v2Implementation = await deployImplementationV2(ownerAcc)
        const initData = getInitDataForV2(fakeOwner.address)

        const updateImplementationTx = proxyAdmin.connect(fakeOwner).upgradeAndCall(depositsProxy.address, v2Implementation.address, initData)
        await expect(updateImplementationTx).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Cant init implementation twice", async () => {
        const v2Implementation = await deployImplementationV2(ownerAcc)

        await updateFromV1ToV2(
            depositsProxy,
            proxyAdmin,
            ownerAcc,
            v2Implementation.address,
        )

        const initData = getInitDataForV2(ownerAcc.address)

        const updateImplementationTx = proxyAdmin.connect(ownerAcc).upgradeAndCall(depositsProxy.address, v2Implementation.address, initData)

        await expect(updateImplementationTx).to.be.revertedWith("Initializable: contract is already initialized")

    })

    it("New variable attends to proxy after update", async () => {

        const initDepositFee = ethers.utils.parseUnits("200", "gwei")

        const v2Implementation = await deployImplementationV2(ownerAcc)

        await updateFromV1ToV2(
            depositsProxy,
            proxyAdmin,
            ownerAcc,
            v2Implementation.address,
            initDepositFee
        )

        const proxiedImplementationV2 = await ethers.getContractAt("DepositsV2", depositsProxy.address)

        const depositFee = await proxiedImplementationV2.depositFee()

        expect(depositFee).equal(initDepositFee)
    })

    it("New functional attends to proxy after update", async () => {
        const v2Implementation = await deployImplementationV2(ownerAcc)

        const initDepositFee = ethers.utils.parseUnits("150", "gwei")

        await updateFromV1ToV2(
            depositsProxy,
            proxyAdmin,
            ownerAcc,
            v2Implementation.address,
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