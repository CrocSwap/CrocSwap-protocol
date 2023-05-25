import { BigNumber } from "ethers"

const CREATE2_SALTS = new Map<string, string>()

CREATE2_SALTS.set('0x73511669fd4de447fed18bb79bafeac93ab7f31f',
    '0x6784dbbd6e38a55bce13da3fb1e54f646fce9f411916b1f835e1054a790367d9')

export function mapSalt (deployerAddr: string): BigNumber {
    const lookup = CREATE2_SALTS.get(deployerAddr.toLowerCase())
    if (!lookup) {
        throw new Error(`No salt found for ${deployerAddr}`)
    }
    return BigNumber.from(lookup)
}
