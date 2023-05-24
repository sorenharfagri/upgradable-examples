import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { BigNumber } from "ethers";

import { DepositsProxy, DepositsV1, ReentancyAttack } from "../typechain-types";
import { deployImplementationV2, getSecretHash, updateFromV1ToV2 } from "./utils/helpers";
import { DepositsV2Errors } from "./utils/constants";

/* exploits withdraw method in v1, and checks if v2 fixed that possibility */

describe("reentrancy-attack", () => {

    let ownerAcc: SignerWithAddress
    let attackerAcc: SignerWithAddress

    let acc2: SignerWithAddress
    let acc3: SignerWithAddress
    let acc4: SignerWithAddress

    let depositsProxy: DepositsProxy
    let proxiedImplementation: DepositsV1
    let attackContract: ReentancyAttack

    beforeEach(async () => {

        [ownerAcc, attackerAcc, acc2, acc3, acc4] = await ethers.getSigners()

        const implementationFactory = await ethers.getContractFactory("DepositsV1", ownerAcc)
        const implementationV1 = await implementationFactory.deploy()
        await implementationV1.deployed()

        const initDataV1 = implementationV1.interface.encodeFunctionData("initialize")

        const proxyFactory = await ethers.getContractFactory("DepositsProxy", ownerAcc)
        depositsProxy = await proxyFactory.deploy(implementationV1.address, initDataV1)
        await depositsProxy.deployed()

        const reentancyFactory = await ethers.getContractFactory("ReentancyAttack", attackerAcc)
        attackContract = await reentancyFactory.deploy(depositsProxy.address)

        proxiedImplementation = await ethers.getContractAt("DepositsV1", depositsProxy.address)
    })


    it("can attack and withdraw all ether from depositsV1", async () => {
        await mockDeposits()

        const depositsBalance = await depositsProxy.provider.getBalance(depositsProxy.address)
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
            [depositsProxy, attackContract],
            [depositsBalance.mul(-1), depositsBalance.add(attackerDepositValue)]
        )
    })

    it("cant attack DepositsV2", async () => {

        await mockDeposits()

        const depositsV2 = await deployImplementationV2(ownerAcc)

        await updateFromV1ToV2(
            depositsProxy,
            ownerAcc,
            depositsV2.address
        )

        const depositsBalance = await depositsProxy.provider.getBalance(depositsProxy.address)
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

        await expect(attackTx).to.be.revertedWithCustomError(depositsV2, DepositsV2Errors.FailedToSendEther)
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

        const depositTx = await proxiedImplementation.connect(account).deposit(secretHash, { value: amount })
        return depositTx.wait()
    }

})  