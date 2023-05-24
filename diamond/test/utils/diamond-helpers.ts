import { Contract, ethers } from "ethers"

export const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 }


export function getSelectors(contract: Contract) {
    const signatures = Object.keys(contract.interface.functions)

    const selectors = signatures.reduce((acc: any, val) => {
        if (val !== 'init(bytes)') {
            acc.push(contract.interface.getSighash(val))
        }
        return acc
    }, [])

    return selectors
}

export function getSelector(func: string) {
    const abiInterface = new ethers.utils.Interface([func])
    return abiInterface.getSighash(ethers.utils.Fragment.from(func))
}

export function removeSelectors(selectors: string[], signatures: string[]) {
    const iface = new ethers.utils.Interface(signatures.map((v: string) => 'function ' + v))
    const removeSelectors = signatures.map((v: any) => iface.getSighash(v))
    selectors = selectors.filter((v: any) => !removeSelectors.includes(v))
    return selectors
}


// find a particular address position in the return value of diamondLoupeFacet.facets()
export function findAddressPositionInFacets(facetAddress: string, facets: string | any[]) {
    for (let i = 0; i < facets.length; i++) {
        if (facets[i].facetAddress === facetAddress) {
            return i
        }
    }
}
