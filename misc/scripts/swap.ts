
import { CrocSwapDexSeed } from '../../typechain/CrocSwapDexSeed';
import { ethers } from 'hardhat';
import { ContractFactory, BytesLike, BigNumber } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { toSqrtPrice, fromSqrtPrice } from '../../test/FixedPoint';
import { MockERC20 } from '../../typechain/MockERC20';
import { QueryHelper } from '../../typechain/QueryHelper';
import { CrocSwapDex } from '../../contracts/mixins/typechain/CrocSwapDex';

/* Helper script for testing a simple swap. Do NOT use in production. */

const POOL_IDX = 35000

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000"

let override = { gasPrice: BigNumber.from("10").pow(9).mul(5)}

async function deploy() {
    let trader = (await ethers.getSigners())[0]

    let factory = await ethers.getContractFactory("CrocSwapDex");
    let dex = factory.attach("0x141E224f461a85006b2EF051a7C1c290E449202A") as CrocSwapDex

    factory = await ethers.getContractFactory("MockERC20")
    let base = factory.attach("0x66B5b7f1F5604FC33aF247D59a7938369B37358F") as MockERC20
    let quote = factory.attach("0x6c53969F9273560F393a8BcbFA40906E7B51b1B2") as MockERC20

    factory = await ethers.getContractFactory("QueryHelper")
    let query = await factory.attach("0xb0b08549E16C955f158D90b09DC0E84794595a3F") as QueryHelper

    // Display price an 
    let liq = await query.queryLiquidity(base.address, quote.address, POOL_IDX)
    let curve = await query.queryCurve(base.address, quote.address, POOL_IDX)
    let price = fromSqrtPrice(curve.priceRoot_)
    console.log("Price " + price.toString())

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