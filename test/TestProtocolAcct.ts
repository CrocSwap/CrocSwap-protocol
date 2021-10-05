import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { TestProtocolAccount } from '../typechain/TestProtocolAccount';
import { sortBaseToken, sortQuoteToken } from './FacadePool';
import { Signer } from 'ethers';

chai.use(solidity);

describe('Protocol Account', () => {
    let test: TestProtocolAccount
    let baseToken: MockERC20
    let quoteToken: MockERC20
    let thirdToken: MockERC20
    let owner: Signer
    let outsider: Signer
    let treasury: string 

    const INIT_BAL = 100000000

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       let tokenX = factory.deploy() as Promise<MockERC20>
       let tokenY = factory.deploy() as Promise<MockERC20>
       thirdToken = await factory.deploy() as MockERC20

       owner = (await ethers.getSigners())[1]
       outsider = (await ethers.getSigners())[2]

       baseToken = await sortBaseToken(tokenX, tokenY)
       quoteToken = await sortQuoteToken(tokenX, tokenY)

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       treasury = "0x0000000000000000000000000000000000000019"

       factory = await ethers.getContractFactory("TestProtocolAccount")
       test = await factory.deploy(await owner.getAddress()) as TestProtocolAccount
       await baseToken.deposit(test.address, INIT_BAL);
       await quoteToken.deposit(test.address, INIT_BAL); 
    })

    it("accum", async() => {  
      await test.testAccum(baseToken.address, quoteToken.address, 5000, 2500)
      await test.testAccum(baseToken.address, quoteToken.address, 900, 8000)
      expect(await test.protoFeeAccum(baseToken.address)).to.equal(5900)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(10500)
      expect(await test.protoFeeAccum(thirdToken.address)).to.equal(0)
      
    })

    it("disburse", async() => {
      await test.testAccum(baseToken.address, quoteToken.address, 5000, 2500)
      await test.connect(owner).disburseProtocol(treasury, baseToken.address)

      expect(await baseToken.balanceOf(test.address)).to.equal(INIT_BAL - 5000)
      expect(await baseToken.balanceOf(treasury)).to.equal(5000)
      expect(await quoteToken.balanceOf(test.address)).to.equal(INIT_BAL)
      expect(await quoteToken.balanceOf(treasury)).to.equal(0)
      expect(await test.protoFeeAccum(baseToken.address)).to.equal(0)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(2500)
    })

    it("disburse post", async() => {
      await test.testAccum(baseToken.address, quoteToken.address, 5000, 2500)
      await test.connect(owner).disburseProtocol(treasury, baseToken.address)

      await test.testAccum(baseToken.address, quoteToken.address, 3000, 6000)
      await test.connect(owner).disburseProtocol(treasury, quoteToken.address)

      expect(await baseToken.balanceOf(test.address)).to.equal(INIT_BAL - 5000)
      expect(await baseToken.balanceOf(treasury)).to.equal(5000)
      expect(await quoteToken.balanceOf(test.address)).to.equal(INIT_BAL - 8500)
      expect(await quoteToken.balanceOf(treasury)).to.equal(8500)
      expect(await test.protoFeeAccum(baseToken.address)).to.equal(3000)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(0)
    })

    it("unauthorized", async() => {
      await test.testAccum(baseToken.address, quoteToken.address, 5000, 2500)
      await expect(test
        .connect(outsider)
        .disburseProtocol(treasury, baseToken.address)).to.be.reverted
    })
})
