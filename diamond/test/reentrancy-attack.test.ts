import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { BigNumber } from "ethers";

import { DepositsV1, Diamond, ReentancyAttack } from "../typechain-types";
import { deployAndInitDiamond, getSecretHash, upgradeFromV2ToV2 } from "./utils/helpers";
import { DepositsV2Errors } from "./utils/constants";
import { FacetCutAction, getSelectors } from "./utils/diamond-helpers";

/* exploits withdraw method in v1, and checks if v2 fixed that possibility */

describe("reentrancy-attack", () => {

    let ownerAcc: SignerWithAddress
    let attackerAcc: SignerWithAddress

    let acc2: SignerWithAddress
    let acc3: SignerWithAddress
    let acc4: SignerWithAddress

    let diamond: Diamond
    let diamondDeposits: DepositsV1

    let attackContract: ReentancyAttack


    beforeEach(async () => {

        [ownerAcc, attackerAcc, acc2, acc3, acc4] = await ethers.getSigners()

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

        const reentancyFactory = await ethers.getContractFactory("ReentancyAttack", attackerAcc)
        attackContract = await reentancyFactory.deploy(diamond.address)
    })


    it("can attack and withdraw all ether from depositsV1", async () => {
        await mockDeposits()

        const depositsBalance = await diamond.provider.getBalance(diamond.address)
        expect(depositsBalance).greaterThan(0)

        const attackerDepositValue = depositsBalance.div(2)

        const secretWord = "h4ckzor"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretWordHash = getSecretHash(secretWord)

        const attackTx = attackContract.connect(attackerAcc).attack(
            secretWordHash,
            secretWordBytes,
            {
                value: attackerDepositValue
            }
        )

        await expect(attackTx).to.changeEtherBalances(
            [diamond, attackContract],
            [depositsBalance.mul(-1), depositsBalance.add(attackerDepositValue)]
        )
    })

    it("cant attack DepositsV2", async () => {

        await mockDeposits()

        const depositsV2Facet = await upgradeFromV2ToV2(diamond, ownerAcc, "100")

        const depositsBalance = await diamondDeposits.provider.getBalance(diamondDeposits.address)
        expect(depositsBalance).greaterThan(0)

        const attackerDepositValue = depositsBalance.div(2)

        const secretWord = "h4ckzor"
        const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
        const secretWordHash = getSecretHash(secretWord)

        const attackTx = attackContract.connect(attackerAcc).attack(
            secretWordHash,
            secretWordBytes,
            {
                value: attackerDepositValue
            }
        )

        await expect(attackTx).to.be.revertedWithCustomError(depositsV2Facet, DepositsV2Errors.FailedToSendEther)
    })

    async function mockDeposits() {
        const depositTxs = []

        const deposit1 = makeDeposit("1337", acc2, ethers.utils.parseUnits("13.37", "ether"))
        const deposit2 = makeDeposit("1984", acc3, ethers.utils.parseUnits("2", "ether"))
        const deposit3 = makeDeposit("220224", acc4, ethers.utils.parseUnits("0.24", "ether"))

        depositTxs.push(deposit1, deposit2, deposit3)

        return Promise.all(depositTxs)
    }

    async function makeDeposit(
        secretWord: string,
        account: SignerWithAddress,
        amount: BigNumber
    ) {
        const secretHash = getSecretHash(secretWord)

        const depositTx = await diamondDeposits.connect(account).deposit(secretHash, { value: amount })
        return depositTx.wait()
    }

})  