
import { CrocSwapDexSeed } from '../../typechain/CrocSwapDexSeed';
import { ethers } from 'hardhat';
import { ContractFactory, BytesLike, BigNumber, Signer, ContractTransaction } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice } from '../../test/FixedPoint';
import { MockERC20 } from '../../typechain/MockERC20';
import { QueryHelper } from '../../typechain/QueryHelper';
import { CrocSwapDex } from '../../contracts/typechain/CrocSwapDex';
import { minSqrtPrice } from './tmpSwap';
import { addrLessThan } from '../../test/FacadePool';

/* Helper script for deploying a basic mock setup to a localhost or test network.
 * Only for ad-hoc testing purposes. Do NOT use in production. */

const POOL_IDX = 35000
const POOL_IDX_2 = 212
const BIG_QTY = BigNumber.from("10").pow(30)

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000"

let override = { gasPrice: BigNumber.from("10").pow(9).mul(5), gasLimit: 1000000 }

function encodeMintAmbient (base: string, quote: string, pool: number,
    liq: BigNumber, useSurplus: boolean): BytesLike {
    let abiCoder = new ethers.utils.AbiCoder()
    const callCode = 3
    return abiCoder.encode(
        [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "uint128", "uint128", "bool" ], 
        [ callCode, base, quote, pool, 0, 0, liq, minSqrtPrice(), maxSqrtPrice(), useSurplus  ]);
}

async function waitMine (tx: Promise<ContractTransaction>): Promise<ContractTransaction> {
    await (await tx).wait()
    return tx
}

async function deployToken (symbol: string, decimals: number): Promise<MockERC20> {
    let factory = await ethers.getContractFactory("MockERC20")
    let token = await factory.deploy(override) as MockERC20
    await waitMine(token.setSymbol(symbol, override))
    await waitMine(token.setDecimals(decimals, override))
    console.log("Token " + symbol + " " + token.address)
    return token
}

async function fundToken (token: MockERC20, trader: Signer, dex: string): Promise<void> {
    await waitMine(token.deposit(await trader.getAddress(), BIG_QTY, override))
    await waitMine(token.connect(trader).approve(dex, BIG_QTY, override))
    console.log(await token.symbol() + " funded")
}

async function createPool (token: MockERC20, base: MockERC20, price: number, dex: CrocSwapDex): Promise<void> {
    let baseDecs = await base.decimals()
    let quoteDecs = await token.decimals()
    let deflator = Math.pow(10, baseDecs-quoteDecs)
    let weiPrice = deflator * price
    if (addrLessThan(base.address, token.address)) {
        await waitMine(dex.initPool(base.address, token.address, POOL_IDX, toSqrtPrice(weiPrice), override))
        await waitMine(dex.initPool(base.address, token.address, POOL_IDX_2, toSqrtPrice(weiPrice), override))
    } else {
        weiPrice = 1.0 / weiPrice
        await waitMine(dex.initPool(token.address, base.address, POOL_IDX, toSqrtPrice(weiPrice), override))
        await waitMine(dex.initPool(token.address, base.address, POOL_IDX_2, toSqrtPrice(weiPrice), override))
    }
}

async function mintLiq (token: MockERC20, base: MockERC20, dex: CrocSwapDex, query: QueryHelper): Promise<void> {
    let baseDecs = await base.decimals()
    let quoteDecs = await token.decimals()

    let baseCollat = BigNumber.from(1000000)
    let baseCollatWei = baseCollat.mul(Math.pow(10, baseDecs))

    if (addrLessThan(base.address, token.address)) {
        let price = (await query.queryPrice(base.address, token.address, POOL_IDX))
        let liq = baseCollatWei.shl(64).div(price)
        await waitMine(dex.tradeWarm(encodeMintAmbient(base.address, token.address, POOL_IDX, liq, false), override))
        await waitMine(dex.tradeWarm(encodeMintAmbient(base.address, token.address, POOL_IDX_2, liq, false), override))
    } else {
        let price = (await query.queryPrice(token.address, base.address, POOL_IDX))
        let liq = baseCollatWei.mul(price).shr(64)
        await waitMine(dex.tradeWarm(encodeMintAmbient(token.address, base.address, POOL_IDX, liq, false), override))
        await waitMine(dex.tradeWarm(encodeMintAmbient(token.address, base.address, POOL_IDX_2, liq, false), override))
    }
}

async function displayPrice (token: MockERC20, base: MockERC20, query: QueryHelper): Promise<void> {
    let baseDecs = await base.decimals()
    let quoteDecs = await token.decimals()
    let deflator = Math.pow(10, baseDecs-quoteDecs)

    let crocPrice = (addrLessThan(base.address, token.address)) ?
        parseFloat((await query.queryPrice(base.address, token.address, POOL_IDX)).toString()) :
        parseFloat((await query.queryPrice(token.address, base.address, POOL_IDX)).toString())
        
    let divPrice = (crocPrice / Math.pow(2, 64)) * (crocPrice / Math.pow(2, 64))
    if (!addrLessThan(base.address, token.address)) {
        divPrice = 1.0 / divPrice
    }
    let price = divPrice / deflator
    console.log("Quote Price " + (await token.symbol()) + " " + price)
}

async function inflate() {
    let authority = (await ethers.getSigners())[0]

    // Just do everything from one account for Ropsten
    let lp = authority
    let trader = authority

    console.log("Deploying with the following addresses...")
    console.log("Protocol Authority: ", await authority.address)
    console.log("Liquidity Provider: ", await lp.address)
    console.log("Trader: ", await trader.address)    

    let factory = await ethers.getContractFactory("CrocSwapDex");
    //let dex = factory.attach("0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9") as CrocSwapDex
    let dex = factory.attach("0x6c40E8A335bF5956DeBD2FB88D5c98Cc0A760559") as CrocSwapDex

    factory = await ethers.getContractFactory("QueryHelper");
    //let query = factory.attach("0xa513E6E4b8f2a923D98304ec87F64353C4D5C853") as QueryHelper
    let query = factory.attach("0x21E85d6C75a99B132e08dBDdB3166b2550D9e3b6") as QueryHelper

    /*let usdc = await deployToken("USDC", 6)
    let wbtc = await deployToken("WBTC", 8)
    let usdt = await deployToken("USDT", 6)
    let mkr = await deployToken("MKR", 18)
    let shib = await deployToken("SHIB", 18)*/

    factory = await ethers.getContractFactory("MockERC20")
    let usdc = factory.attach("0x83e77C197E744D21810A1f970cD24A246E0932a1") as MockERC20
    let wbtc = factory.attach("0xccea4Dfe9F0dBCCf6357b935846bF67778167D99") as MockERC20
    let usdt = factory.attach("0xe41BC7F1bD07a1A6651B6Fad2520715c1827F692") as MockERC20
    let mkr = factory.attach("0x1440186D311F764Ce7e3C2164E2Dff4cf1826A97") as MockERC20
    let shib = factory.attach("0x49f4B51EB3029024335ea30E2f46c3F5D35c40a8") as MockERC20

    let tokens = [usdc, wbtc, usdt, mkr, shib]
    let quotables = [wbtc, usdt, mkr, shib]

    await fundToken(usdc, trader, dex.address)
    await fundToken(wbtc, trader, dex.address)
    await fundToken(usdt, trader, dex.address)
    await fundToken(mkr, trader, dex.address)
    await fundToken(shib, trader, dex.address)

    /*await createPool(usdt, usdc, 1.0, dex)
    await createPool(wbtc, usdc, 65000.0, dex)
    await createPool(mkr, usdc, 3340.0, dex)
    await createPool(shib, usdc, 0.000089, dex)*/

    /*await mintLiq(wbtc, usdc, dex, query)
    await mintLiq(usdt, usdc, dex, query)
    await mintLiq(mkr, usdc, dex, query)
    await mintLiq(shib, usdc, dex, query)
    
    await displayPrice(wbtc, usdc, query)
    await displayPrice(usdt, usdc, query)
    await displayPrice(mkr, usdc, query)
    await displayPrice(shib, usdc, query)*/
}

inflate()