
import { CrocSwapDexSeed } from '../../typechain/CrocSwapDexSeed';
import { ethers } from 'hardhat';
import { ContractFactory, BytesLike, BigNumber } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { toSqrtPrice, fromSqrtPrice } from '../../test/FixedPoint';
import { MockERC20 } from '../../typechain/MockERC20';
import { QueryHelper } from '../../typechain/QueryHelper';
import { CrocSwapDex } from '../../contracts/typechain/CrocSwapDex';

/* Helper script for deploying a basic mock setup to a localhost or test network.
 * Only for ad-hoc testing purposes. Do NOT use in production. */

const POOL_IDX = 35000
const FEE_RATE = 30 * 100
const BIG_QTY = BigNumber.from("1000000000000000")

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000"

function encodeProtocolCmd (code: number, token: string, sidecar: string, poolIdx: number, 
    feeRate: number, protoTake: number, ticks: number, value: number): BytesLike {
    let abiCoder = new ethers.utils.AbiCoder()
    return abiCoder.encode(
        [ "uint8", "address", "address", "uint24", "uint24", "uint8", "uint16", "uint128" ], 
        [ code, token, sidecar, poolIdx, feeRate, protoTake, ticks, value ]);
}

function encodeMintAmbient (base: string, quote: string,
    liq: number, limitQty: BigNumber, useSurplus: boolean): BytesLike {
    let abiCoder = new ethers.utils.AbiCoder()
    const callCode = 3
    return abiCoder.encode(
        [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "int128", "bool" ], 
        [ callCode, base, quote, POOL_IDX, 0, 0, liq, limitQty, useSurplus  ]);
}

let override = { gasPrice: BigNumber.from("10").pow(9).mul(5), gasLimit: 1000000 }

async function deploy() {
    let authority = (await ethers.getSigners())[0]
    /*let lp = (await ethers.getSigners())[1]
    let trader = (await ethers.getSigners())[2]*/

    // Just do everything from one account for Ropsten
    let lp = authority
    let trader = authority

    console.log("Deploying with the following addresses...")
    console.log("Protocol Authority: ", await authority.address)
    console.log("Liquidity Provider: ", await lp.address)
    console.log("Trader: ", await trader.address)    

    /*let factory = await ethers.getContractFactory("ColdPath")
    let coldPath = (await factory.deploy(override)).address

    factory = await ethers.getContractFactory("WarmPath")
    let warmPath = (await factory.deploy(override)).address

    factory = await ethers.getContractFactory("LongPath")
    let longPath = (await factory.deploy(override)).address

    factory = await ethers.getContractFactory("MicroPaths")
    let microPath = (await factory.deploy(override)).address*/

    let factory = await ethers.getContractFactory("CrocSwapDex");
    /*let dex = await factory.deploy(authority.getAddress(), 
        coldPath, warmPath, longPath, microPath) as CrocSwapDexSeed*/
    let dex = factory.attach("0x141E224f461a85006b2EF051a7C1c290E449202A") as CrocSwapDex

    console.log("CrocSwap Dex Created:" + dex.address)

    factory = await ethers.getContractFactory("MockERC20")
    /*let base = await factory.deploy(override) as MockERC20
    let quote = await factory.deploy(override) as MockERC20
    if( base.address > quote.address) {
        let holder = base
        base = quote
        quote = holder
    }*/

    //let base = factory.attach("0x66B5b7f1F5604FC33aF247D59a7938369B37358F")
    //let quote = factory.attach("0x6c53969F9273560F393a8BcbFA40906E7B51b1B2")
    let base = factory.attach("0x10e13e6DE3BD3A5D2e0361F56a695EB08731E40B") as MockERC20
    let quote = factory.attach("0x788C030D0ac6cd3902Da1Bcc3C6945b8be6f3BA2") as MockERC20

    console.log("Mock Base Token created: " + base.address)
    console.log("Mock Quote Token created: " + quote.address);

    /*await base.setDecimals(3)
    await quote.setDecimals(6)*/
    await base.setSymbol("USDC")
    await quote.setSymbol("WETH")
    return;

    await base.deposit("0xd825D73CDD050ecbEBC0B3a8D9C5952d1F64722e", BIG_QTY, override)
    await quote.deposit("0xd825D73CDD050ecbEBC0B3a8D9C5952d1F64722e", BIG_QTY, override)
    await base.deposit(await lp.getAddress(), BIG_QTY, override)
    await quote.deposit(await lp.getAddress(), BIG_QTY, override)
    await base.deposit(await trader.getAddress(), BIG_QTY, override)
    await quote.deposit(await trader.getAddress(), BIG_QTY, override)
    await base.connect(lp).approve(dex.address, BIG_QTY, override)
    await quote.connect(lp).approve(dex.address, BIG_QTY, override)
    await base.connect(trader).approve(dex.address, BIG_QTY, override)
    await quote.connect(trader).approve(dex.address, BIG_QTY, override)

    //let protoCmd = encodeProtocolCmd(66, ZERO_ADDR, ZERO_ADDR, POOL_IDX, FEE_RATE, 0, 30, 100)
    //await dex.protocolCmd(protoCmd, override)
    await dex.initPool(base.address, quote.address, POOL_IDX, toSqrtPrice(1.0), override)

    console.log("Pool initialized at Index: " + POOL_IDX)

    let mintCmd = encodeMintAmbient(base.address, quote.address, 100000000000, BIG_QTY, false)
    await dex.connect(lp).tradeWarm(mintCmd, override)

    factory = await ethers.getContractFactory("QueryHelper")
    let query = await factory.deploy(dex.address, override) as QueryHelper
    console.log("Query Sidecar at " + query.address)

    let liq = await query.queryLiquidity(base.address, quote.address, POOL_IDX)
    let curve = await query.queryCurve(base.address, quote.address, POOL_IDX)
    let price = fromSqrtPrice(curve.priceRoot_)
    console.log("Liquidity added  " + liq.toString() + " at price " + price.toString())

    let swapTx = await dex.connect(trader)
        .swap(base.address, quote.address, POOL_IDX, 
            true, true, BigNumber.from(10000000000), toSqrtPrice(1.5), false, override)

    liq = await query.queryLiquidity(base.address, quote.address, POOL_IDX)
    curve = await query.queryCurve(base.address, quote.address, POOL_IDX)
    price = fromSqrtPrice(curve.priceRoot_)
    console.log("Swap Tx: " + swapTx.hash)
    console.log("Liquidity " + liq.toString() + " at price " + price.toString())
}

deploy()