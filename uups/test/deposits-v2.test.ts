import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"

import { DepositsProxy, DepositsV2 } from "../typechain-types";
import { DepositsV2Errors } from "./utils/constants";
import { deployImplementationV2, getSecretHash } from "./utils/helpers";
import { getInitDataForV2 } from "./utils/helpers";

describe("deposits-v2", () => {

    const depositFee = ethers.utils.parseUnits("100", "gwei")

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress
    let acc3: SignerWithAddress

    let depositsProxy: DepositsProxy
    let proxiedImplementation: DepositsV2

    beforeEach(async () => {

        [ownerAcc, acc2, acc3] = await ethers.getSigners()

        const implementationFactoryv1 = await ethers.getContractFactory("DepositsV1", ownerAcc)
        const implementationV1 = await implementationFactoryv1.deploy()
        await implementationV1.deployed()
        
        const initDataV1 = implementationV1.interface.encodeFunctionData("initialize")

        const proxyFactory = await ethers.getContractFactory("DepositsProxy", ownerAcc)
        depositsProxy = await proxyFactory.deploy(implementationV1.address, initDataV1)
        await depositsProxy.deployed()

        const proxiedImplementationV1 = await ethers.getContractAt("DepositsV1", depositsProxy.address)

        const implementationV2 = await deployImplementationV2(ownerAcc)
        const initDataV2 = getInitDataForV2(depositFee)

        const upgradeImplementationTx = await proxiedImplementationV1.connect(ownerAcc).upgradeToAndCall(implementationV2.address, initDataV2)
        await upgradeImplementationTx.wait()

        proxiedImplementation = await ethers.getContractAt("DepositsV2", depositsProxy.address)
    })


    it("user can deposit eth", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")
        const depositFee = await proxiedImplementation.depositFee()

        const secretHash = getSecretHash("2402")

        const depositTx = proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx).to.changeEtherBalances([userAcc, proxiedImplementation], [depositAmount.mul(-1), depositAmount])

        const depositedAmount = await proxiedImplementation.deposits(secretHash)
        const profitAmount = await proxiedImplementation.profitAmount()

        expect(depositedAmount).equal(depositAmount.sub(depositFee))
        expect(profitAmount).equal(depositFee)
    })

    it("Cant deposit if tx value <= deposit fee", async () => {
        const userAcc = acc2

        const depositFee = await proxiedImplementation.depositFee()
        const secretHash = getSecretHash("2402")

        const depositTx = proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositFee })
        await expect(depositTx).to.be.revertedWithCustomError(proxiedImplementation, DepositsV2Errors.InvalidTxValue)

        const depositTx2 = proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositFee.sub(1) })
        await expect(depositTx2).to.be.revertedWithCustomError(proxiedImplementation, DepositsV2Errors.InvalidTxValue)
    })

    it("Cant deposit if deposit with given hash already exists", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretHash = getSecretHash("2402")

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const depositTx2 = proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx2).to.be.revertedWithCustomError(proxiedImplementation, DepositsV2Errors.DepositAlreadyExists)
    })

    it("Any user can withdraw with secret word", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretHash = getSecretHash(secretWord)

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const otherAcc = acc3
        const withdrawTx = proxiedImplementation.connect(otherAcc).withdraw(secretWordBytes)

        const depositFee = await proxiedImplementation.depositFee()
        const depositAmountAfterFee = depositAmount.sub(depositFee)

        await expect(withdrawTx).to.changeEtherBalances([otherAcc, proxiedImplementation], [depositAmountAfterFee, depositAmountAfterFee.mul(-1)])

        const depositedAmount = await proxiedImplementation.deposits(secretHash)
        expect(depositedAmount).equal(0)
    })

    it("Cant withdraw with incorrect secret word", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretHash = getSecretHash(secretWord)

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const fakeSecretWord = ethers.utils.formatBytes32String("1338")

        const otherAcc = acc3
        const withdrawTx = proxiedImplementation.connect(otherAcc).withdraw(fakeSecretWord)

        await expect(withdrawTx).to.be.revertedWithCustomError(proxiedImplementation, DepositsV2Errors.DepositNotFound)
    })

    it("Cant withdraw deposit if already withdrawed", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretHash = getSecretHash(secretWord)

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()


        const otherAcc = acc3
        const withdrawTx = await proxiedImplementation.connect(otherAcc).withdraw(secretWordBytes)

        await withdrawTx.wait()

        const withdrawTx2 = proxiedImplementation.connect(otherAcc).withdraw(secretWordBytes)
        await expect(withdrawTx2).to.be.revertedWithCustomError(proxiedImplementation, DepositsV2Errors.DepositNotFound)
    })

    it("Owner can withdraw profit", async () => {
        const owner = ownerAcc
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")
        const depositFee = await proxiedImplementation.depositFee()

        const secretHash = getSecretHash("1337")

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const secretHash2 = getSecretHash("l33t")
        const depositTx2 = await proxiedImplementation.connect(userAcc).deposit(secretHash2, { value: depositAmount })
        await depositTx2.wait()

        const profitAmount = await proxiedImplementation.profitAmount()
        expect(profitAmount).equal(depositFee.mul(2))

        const withdrawProfitTx = await proxiedImplementation.withdrawProfit()

        await expect(withdrawProfitTx).to.changeEtherBalances([owner, proxiedImplementation], [profitAmount, profitAmount.mul(-1)])

        const profitAmountAfterWithdraw = await proxiedImplementation.profitAmount()
        expect(profitAmountAfterWithdraw).equal(0)
    })

    it("Owner cant withdraw profit if there is none", async () => {
        const owner = ownerAcc

        const withdrawProfitTx = proxiedImplementation.connect(owner).withdrawProfit()

        await expect(withdrawProfitTx).to.be.revertedWithCustomError(proxiedImplementation, DepositsV2Errors.ProfitNotFound)
    })

    it("Non owner cant withdraw profit", async () => {
        const fakeOwner = acc3
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")


        const secretHash = getSecretHash("1437")

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const withdrawProfitTx = proxiedImplementation.connect(fakeOwner).withdrawProfit()

        await expect(withdrawProfitTx).to.be.revertedWith("Ownable: caller is not the owner")
    })

})  