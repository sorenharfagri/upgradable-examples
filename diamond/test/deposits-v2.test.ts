import { ethers } from "hardhat";
import { expect } from "chai"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

import { DepositsV1, DepositsV2, Diamond } from "../typechain-types";
import { DepositsV2Errors } from "./utils/constants";
import { deployAndInitDiamond, getSecretHash } from "./utils/helpers";
import { FacetCutAction, getSelector, getSelectors } from "./utils/diamond-helpers";

describe("deposits-v2", () => {

    const depositFee = ethers.utils.parseUnits("100", "gwei")

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress
    let acc3: SignerWithAddress

    let diamond: Diamond

    let diamondDepositsV1: DepositsV1
    let diamondDepositsV2: DepositsV2


    beforeEach(async () => {

        [ownerAcc, acc2, acc3] = await ethers.getSigners()

        diamond = await deployAndInitDiamond(ownerAcc)

        const depositsV1FacetFactory = await ethers.getContractFactory("DepositsV1")
        const depositsV1Facet = await depositsV1FacetFactory.deploy()
        await depositsV1Facet.deployed()

        const depositsV1Cut = {
            facetAddress: depositsV1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: [getSelector("function getDeposit(bytes32 hashedSecret) external view returns (uint256)")]
        }

        const depositsV2FacetFactory = await ethers.getContractFactory("DepositsV2")
        const depositsV2Facet = await depositsV2FacetFactory.deploy()
        await depositsV2Facet.deployed()

        const depositsInitFactory = await ethers.getContractFactory("DepositsV2Init")
        const depositsInitializer = await depositsInitFactory.deploy()
        await depositsInitializer.deployed()


        const depositsV2Cut = {
            facetAddress: depositsV2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(depositsV2Facet)
        }

        const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)

        const initData = depositsInitializer.interface.encodeFunctionData("init", [depositFee])
        const depositsV2CutTx = await diamondCut.diamondCut([depositsV1Cut, depositsV2Cut], depositsInitializer.address, initData)
        await depositsV2CutTx.wait()

        diamondDepositsV1 = await ethers.getContractAt("DepositsV1", diamond.address)
        diamondDepositsV2 = await ethers.getContractAt("DepositsV2", diamond.address)
    })


    it("user can deposit eth", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")
        const depositFee = await diamondDepositsV2.depositFee()

        const secretHash = getSecretHash("2402")

        const depositTx = diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx).to.changeEtherBalances([userAcc, diamondDepositsV2], [depositAmount.mul(-1), depositAmount])

        const depositedAmount = await diamondDepositsV1.getDeposit(secretHash)
        const profitAmount = await diamondDepositsV2.profitAmount()

        expect(depositedAmount).equal(depositAmount.sub(depositFee))
        expect(profitAmount).equal(depositFee)
    })

    it("Cant deposit if tx value <= deposit fee", async () => {
        const userAcc = acc2

        const depositFee = await diamondDepositsV2.depositFee()
        const secretHash = getSecretHash("2402")

        const depositTx = diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositFee })
        await expect(depositTx).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.InvalidTxValue)

        const depositTx2 = diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositFee.sub(1) })
        await expect(depositTx2).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.InvalidTxValue)
    })

    it("Cant deposit if deposit with given hash already exists", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretHash = getSecretHash("2402")

        const depositTx = await diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const depositTx2 = diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx2).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.DepositAlreadyExists)
    })

    it("Any user can withdraw with secret word", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const otherAcc = acc3
        const withdrawTx = diamondDepositsV2.connect(otherAcc).withdraw(secretWordBytes)

        const depositFee = await diamondDepositsV2.depositFee()
        const depositAmountAfterFee = depositAmount.sub(depositFee)

        await expect(withdrawTx).to.changeEtherBalances([otherAcc, diamondDepositsV2], [depositAmountAfterFee, depositAmountAfterFee.mul(-1)])

        const depositedAmount = await diamondDepositsV1.getDeposit(secretHash)
        expect(depositedAmount).equal(0)
    })

    it("Cant withdraw with incorrect secret word", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()


        const fakeSecretWord = ethers.utils.formatBytes32String("1338")

        const otherAcc = acc3
        const withdrawTx = diamondDepositsV2.connect(otherAcc).withdraw(fakeSecretWord)

        await expect(withdrawTx).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.DepositNotFound)
    })

    it("Cant withdraw deposit if already withdrawed", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()


        const otherAcc = acc3
        const withdrawTx = await diamondDepositsV2.connect(otherAcc).withdraw(secretWordBytes)

        await withdrawTx.wait()

        const withdrawTx2 = diamondDepositsV2.connect(otherAcc).withdraw(secretWordBytes)
        await expect(withdrawTx2).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.DepositNotFound)
    })

    it("Owner can withdraw profit", async () => {
        const owner = ownerAcc
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")
        const depositFee = await diamondDepositsV2.depositFee()

        const secretHash = getSecretHash("1337")

        const depositTx = await diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const secretHash2 = getSecretHash("l33t")
        const depositTx2 = await diamondDepositsV2.connect(userAcc).deposit(secretHash2, { value: depositAmount })
        await depositTx2.wait()

        const profitAmount = await diamondDepositsV2.profitAmount()
        expect(profitAmount).equal(depositFee.mul(2))

        const withdrawProfitTx = await diamondDepositsV2.withdrawProfit()

        await expect(withdrawProfitTx).to.changeEtherBalances([owner, diamondDepositsV2], [profitAmount, profitAmount.mul(-1)])

        const profitAmountAfterWithdraw = await diamondDepositsV2.profitAmount()
        expect(profitAmountAfterWithdraw).equal(0)
    })

    it("Owner cant withdraw profit if there is none", async () => {
        const owner = ownerAcc

        const withdrawProfitTx = diamondDepositsV2.connect(owner).withdrawProfit()

        await expect(withdrawProfitTx).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.ProfitNotFound)
    })

    it("Non owner cant withdraw profit", async () => {
        const fakeOwner = acc3
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")


        const secretHash = getSecretHash("1437")

        const depositTx = await diamondDepositsV2.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const withdrawProfitTx = diamondDepositsV2.connect(fakeOwner).withdrawProfit()

        await expect(withdrawProfitTx).to.be.revertedWithCustomError(diamondDepositsV2, DepositsV2Errors.NotAnOwner)
    })

})  