import { TestDex } from '../typechain/TestDex'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';

chai.use(solidity);

describe('Dex', () => {
    let dex: TestDex

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("TestDex")
       dex = await factory.deploy() as TestDex
    })

    it("empty", async() => {
        console.log(dex.address)
    })

})
