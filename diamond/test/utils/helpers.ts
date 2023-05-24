import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"

import { Diamond } from "../../typechain-types";
import { FacetCutAction, getSelector, getSelectors } from "./diamond-helpers";

function getSecretHash(secretWord: string) {

    const secretWordBytes = ethers.utils.formatBytes32String(secretWord)
    const secretHash = ethers.utils.solidityKeccak256(["bytes32"], [secretWordBytes])

    return secretHash
}

async function deployAndInitDiamond(owner: SignerWithAddress) {
    // deploy DiamondCutFacet
    const DiamondCutFacet = await ethers.getContractFactory('DiamondCutFacet')
    const diamondCutFacet = await DiamondCutFacet.deploy()
    await diamondCutFacet.deployed()

    // deploy Diamond
    const Diamond = await ethers.getContractFactory('Diamond')
    const diamond = await Diamond.deploy(owner.address, diamondCutFacet.address)
    await diamond.deployed()

    // deploy DiamondInit
    // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
    // Read about how the diamondCut function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
    const DiamondInit = await ethers.getContractFactory('DiamondInit')
    const diamondInit = await DiamondInit.deploy()
    await diamondInit.deployed()

    // deploy facets
    const FacetNames = [
        'DiamondLoupeFacet',
        'OwnershipFacet'
    ]

    const cuts = []

    for (const FacetName of FacetNames) {
        const Facet = await ethers.getContractFactory(FacetName)
        const facet = await Facet.deploy()
        await facet.deployed()
        cuts.push({
            facetAddress: facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(facet)
        })
    }

    // upgrade diamond with facets
    const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)
    // call to init function
    const initData = diamondInit.interface.encodeFunctionData('init')
    const cutTx = await diamondCut.diamondCut(cuts, diamondInit.address, initData)

    const cutTxReceipt = await cutTx.wait()
    if (!cutTxReceipt.status) {
        throw Error(`Diamond upgrade failed: ${cutTx.hash}`)
    }

    return diamond
}

async function upgradeFromV2ToV2(
    diamond: Diamond,
    owner: SignerWithAddress,
    depositFee: BigNumberish
) {
    const depositsV2FacetFactory = await ethers.getContractFactory("DepositsV2")
    const depositsV2Facet = await depositsV2FacetFactory.deploy()
    await depositsV2Facet.deployed()

    const depositsInitFactory = await ethers.getContractFactory("DepositsV2Init")
    const depositsInitializer = await depositsInitFactory.deploy()
    await depositsInitializer.deployed()

    const selectorsToReplace = []

    selectorsToReplace.push(getSelector("function deposit(bytes32 hashedKey) external payable"))
    selectorsToReplace.push(getSelector("function withdraw(bytes32 secretWord) external"))

    const replaceCut = {
        facetAddress: depositsV2Facet.address,
        action: FacetCutAction.Replace,
        functionSelectors: selectorsToReplace
    }

    const selectorsToAdd = []

    selectorsToAdd.push(getSelector("function withdrawProfit() external"))
    selectorsToAdd.push(getSelector("function depositFee() external view returns (uint256)"))
    selectorsToAdd.push(getSelector("function profitAmount() external view returns (uint256)"))

    const addCut = {
        facetAddress: depositsV2Facet.address,
        action: FacetCutAction.Add,
        functionSelectors: selectorsToAdd
    }

    const diamondCut = await ethers.getContractAt('IDiamondCut', diamond.address)

    const initData = depositsInitializer.interface.encodeFunctionData("init", [depositFee])

    const cutTx = await diamondCut.connect(owner).diamondCut([replaceCut, addCut], depositsInitializer.address, initData)
    await cutTx.wait()

    return depositsV2Facet
}

export { deployAndInitDiamond, upgradeFromV2ToV2, getSecretHash }