import { BigNumber } from "ethers"

const CREATE2_SALTS = new Map<string, string>()

CREATE2_SALTS.set('0x73511669fd4de447fed18bb79bafeac93ab7f31f',
    '0x6784dbbd6e38a55bce13da3fb1e54f646fce9f411916b1f835e1054a790367d9')

CREATE2_SALTS.set('0x25662C94D28DA775C4E4FDCA987B14D704B4b349'.toLowerCase(),
    '0xaa648ca9a669467563048f9854d0c61d261957924a3753296908131cee781714')    

export function mapSalt (deployerAddr: string): BigNumber {
    const lookup = CREATE2_SALTS.get(deployerAddr.toLowerCase())
    if (!lookup) {
        throw new Error(`No salt found for ${deployerAddr}`)
    }
    return BigNumber.from(lookup)
}
