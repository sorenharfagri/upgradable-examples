import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"

import { FacetCutAction, getSelectors } from "./utils/diamond-helpers"
import { DepositsV1, Diamond } from "../typechain-types";
import { DepositsV1Errors } from "./utils/constants";
import { deployAndInitDiamond, getSecretHash } from "./utils/helpers";

describe("deposits-v1", () => {

    let ownerAcc: SignerWithAddress
    let acc2: SignerWithAddress
    let acc3: SignerWithAddress

    let diamond: Diamond
    let diamondDeposits: DepositsV1

    beforeEach(async () => {

        [ownerAcc, acc2, acc3] = await ethers.getSigners()

        diamond = await deployAndInitDiamond(ownerAcc)

        const depositsFacetFactory = await ethers.getContractFactory("DepositsV1")
        const depositsFacet = await depositsFacetFactory.deploy()
        await depositsFacet.deployed()

        const cut = {
            facetAddress: depositsFacet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(depositsFacet)
        }

        const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)
        const cutTx = await diamondCut.diamondCut([cut], ethers.constants.AddressZero, "0x")
        await cutTx.wait()

        diamondDeposits = await ethers.getContractAt("DepositsV1", diamond.address)
    })


    it("user can deposit eth", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretHash = getSecretHash("1337")

        const depositTx = diamondDeposits.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx).to.changeEtherBalances([userAcc, diamondDeposits], [depositAmount.mul(-1), depositAmount])

        const depositedAmount = await diamondDeposits.getDeposit(secretHash)
        expect(depositedAmount).equal(depositAmount)
    })

    it("Cant deposit without tx value", async () => {
        const userAcc = acc2

        const secretHash = getSecretHash("1337")

        const depositTx = diamondDeposits.connect(userAcc).deposit(secretHash)

        await expect(depositTx).to.be.revertedWithCustomError(diamondDeposits, DepositsV1Errors.ZeroTxValue)
    })

    it("Cant deposit if deposit with given hash already exists", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretHash = getSecretHash("1337")

        const depositTx = await diamondDeposits.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const depositTx2 = diamondDeposits.connect(userAcc).deposit(secretHash, { value: depositAmount })

        await expect(depositTx2).to.be.revertedWithCustomError(diamondDeposits, DepositsV1Errors.DepositAlreadyExists)
    })

    it("Any user can withdraw with secret word", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDeposits.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const otherAcc = acc3
        const withdrawTx = diamondDeposits.connect(otherAcc).withdraw(secretWordBytes)

        await expect(withdrawTx).to.changeEtherBalances([otherAcc, diamondDeposits], [depositAmount, depositAmount.mul(-1)])

        const depositedAmount = await diamondDeposits.getDeposit(secretHash)
        expect(depositedAmount).equal(0)
    })

    it("Cant withdraw with incorrect secret word", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDeposits.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()


        const fakeSecretHash = getSecretHash("1338")

        const otherAcc = acc3
        const withdrawTx = diamondDeposits.connect(otherAcc).withdraw(fakeSecretHash)

        await expect(withdrawTx).to.be.revertedWithCustomError(diamondDeposits, DepositsV1Errors.DepositNotFound)
    })

    it("Cant withdraw if deposit already withdrawed", async () => {
        const userAcc = acc2

        const depositAmount = ethers.utils.parseUnits("1.0", "ether")

        const secretWord = "1337"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDeposits.connect(userAcc).deposit(secretHash, { value: depositAmount })
        await depositTx.wait()

        const otherAcc = acc3
        const withdrawTx = await diamondDeposits.connect(otherAcc).withdraw(secretWordBytes)

        await withdrawTx.wait()

        const withdrawTx2 = diamondDeposits.connect(otherAcc).withdraw(secretWordBytes)
        await expect(withdrawTx2).to.be.revertedWithCustomError(diamondDeposits, DepositsV1Errors.DepositNotFound)
    })

})