import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { TestProtocolAccount } from '../typechain/TestProtocolAccount';

chai.use(solidity);

describe('Protocol Account', () => {
    let test: TestProtocolAccount
    let baseToken: MockERC20
    let quoteToken: MockERC20
    let treasury: string 

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       treasury = "0x0000000000000000000000000000000000000019"

       factory = await ethers.getContractFactory("TestProtocolAccount")
       test = await factory.deploy(treasury, quoteAddr, baseAddr) as TestProtocolAccount
       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
    })

    it("accum", async() => {
         await test.testAccum(5000, true)
         await test.testAccum(2500, false)
         await test.testAccum(8000, false)
         await test.testAccum(900, true)
         let accum = await test.getAccum()
         expect(accum[0]).to.equal(10500)
         expect(accum[1]).to.equal(5900)
    })

    it("accum", async() => {
      await test.testAccum(5000, true)
      await test.testAccum(2500, false)
      await test.testAccum(8000, false)
      await test.testAccum(900, true)
    })
})
