import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { WBERA } from '../typechain';

chai.use(solidity);

describe('Pool Swap', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })
    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true
    })


})
