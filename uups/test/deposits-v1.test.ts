import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"

import { DepositsProxy, DepositsV1 } from "../typechain-types";
import { DepositsV1Errors } from "./utils/constants";
import { getSecretHash } from "./utils/helpers";

describe("deposits-v1", () => {

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress
    let acc3: SignerWithAddress

    let depositsProxy: DepositsProxy
    let proxiedImplementation: DepositsV1


    beforeEach(async () => {

        [ownerAcc, acc2, acc3] = await ethers.getSigners()


        const implementationFactory = await ethers.getContractFactory("DepositsV1", ownerAcc)
        const implementationV1 = await implementationFactory.deploy()
        await implementationV1.deployed()

        const proxyFactory = await ethers.getContractFactory("DepositsProxy", ownerAcc)
        const initData = implementationV1.interface.encodeFunctionData("initialize")

        depositsProxy = await proxyFactory.deploy(implementationV1.address, initData)
        await depositsProxy.deployed()

        proxiedImplementation = await ethers.getContractAt("DepositsV1", depositsProxy.address)
    })


    it("user can deposit eth", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")
        const secretHash = getSecretHash("1337")

        const depositTx = proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx).to.changeEtherBalances([userAcc, proxiedImplementation], [depositAmount.mul(-1), depositAmount])

        const depositedAmount = await proxiedImplementation.deposits(secretHash)
        expect(depositedAmount).equal(depositAmount)
    })

    it("Cant deposit without tx value", async () => {
        const userAcc = acc2

        const secretHash = getSecretHash("1337")

        const depositTx = proxiedImplementation.connect(userAcc).deposit(secretHash)

        await expect(depositTx).to.be.revertedWithCustomError(proxiedImplementation, DepositsV1Errors.ZeroTxValue)
    })

    it("Cant deposit if deposit with given hash already exists", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretHash = getSecretHash("1337")

        const depositTx = await proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const depositTx2 = proxiedImplementation.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx2).to.be.revertedWithCustomError(proxiedImplementation, DepositsV1Errors.DepositAlreadyExists)
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

        await expect(withdrawTx).to.changeEtherBalances([otherAcc, proxiedImplementation], [depositAmount, depositAmount.mul(-1)])

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


        const fakeSecretHash = getSecretHash("1338")

        const otherAcc = acc3
        const withdrawTx = proxiedImplementation.connect(otherAcc).withdraw(fakeSecretHash)

        await expect(withdrawTx).to.be.revertedWithCustomError(proxiedImplementation, DepositsV1Errors.DepositNotFound)
    })

    it("Cant withdraw if deposit already withdrawed", async () => {
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
        await expect(withdrawTx2).to.be.revertedWithCustomError(proxiedImplementation, DepositsV1Errors.DepositNotFound)
    })

})