import { BigNumber } from "ethers"

const CREATE2_SALTS = new Map<string, string>()

CREATE2_SALTS.set('0x73511669fd4de447fed18bb79bafeac93ab7f31f',
    '0x6784dbbd6e38a55bce13da3fb1e54f646fce9f411916b1f835e1054a790367d9')

CREATE2_SALTS.set('0x25662C94D28DA775C4E4FDCA987B14D704B4b349'.toLowerCase(),
    '0xaa648ca9a669467563048f9854d0c61d261957924a3753296908131cee781714')    

// Mantle testnet
CREATE2_SALTS.set('0xE8a5ca1e74cb443D929f08eb37cF1B3B8480c18C'.toLowerCase(),
    '0xaa648ca9a669467563048f9854d0c61d261957924a3753296908131cee781714')    

// Scroll Sepolia testnet
CREATE2_SALTS.set('0x4DB1A112aF2EB7e50F1ebd05f717456DD3bA0005'.toLowerCase(), 
    '0xc0ecfc1b13b4a60842489dad84e28486ed400db20be14d4ed3ccc9ee72da3bac')

// Scroll Mainnet salt
CREATE2_SALTS.set('0x754EEF5862082607184e7A3aB08CEA76EF928285'.toLowerCase(), 
    '0x7bdf2029500c02474d9b3c61fb3ab3fbce5329b7dc7445234bb7251c8036d386')

// Blast Sepolia salt
CREATE2_SALTS.set('0x343733Aa5bFaE9fD7160e675F0E284590056D0ad'.toLowerCase(), 
    '0x7bdf2029500c02474d9b3c61fb3ab3fbce5329b7dc7445234bb7251c8036d386')

// Blast Mainnet salt
CREATE2_SALTS.set('0x754EEF5862082607184e7A3aB08CEA76EF928285'.toLowerCase(), 
    '0x79649194a80994b86c379f158f2879e062551218a7b7f156bdaedfd1792afc37')

export function mapSalt (deployerAddr: string): BigNumber {
    const lookup = CREATE2_SALTS.get(deployerAddr.toLowerCase())
    if (!lookup) {
        throw new Error(`No salt found for ${deployerAddr}`)
    }
    console.log(lookup)
    return BigNumber.from(lookup)
}
