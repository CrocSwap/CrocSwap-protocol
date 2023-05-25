import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { TestProtocolAccount } from '../typechain/TestProtocolAccount';
import { sortBaseToken, sortQuoteToken } from './FacadePool';
import { Signer, BigNumber, Overrides } from 'ethers';

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
    const ZERO_TOKEN = "0x0000000000000000000000000000000000000000"

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       let tokenX = factory.deploy() as Promise<MockERC20>
       let tokenY = factory.deploy() as Promise<MockERC20>
       thirdToken = await factory.deploy() as MockERC20

       owner = (await ethers.getSigners())[1]
       outsider = (await ethers.getSigners())[2]

       quoteToken = await tokenX;
       baseToken = await tokenY;
       if ((await tokenX).address.toLocaleLowerCase() < (await tokenY).address.toLocaleLowerCase()) {
         baseToken = await tokenX;
         quoteToken = await tokenY;
       }

       treasury = "0x0000000000000000000000000000000000000019"

       factory = await ethers.getContractFactory("TestProtocolAccount")
       test = await factory.deploy(await owner.getAddress()) as TestProtocolAccount
       await baseToken.deposit(test.address, INIT_BAL);
       await quoteToken.deposit(test.address, INIT_BAL); 
       let overrides = { value: BigNumber.from(INIT_BAL) }
       await test.noop(overrides)
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

      expect(await test.getPaidFees(treasury, baseToken.address)).to.equal(5000)
      expect(await test.getPaidFees(treasury, quoteToken.address)).to.equal(0)
      expect(await test.protoFeeAccum(baseToken.address)).to.equal(0)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(2500)
    })

    it("ethereum token", async() => {
      await test.testAccum(ZERO_TOKEN, quoteToken.address, 5000, 2500)
      await test.testAccum(ZERO_TOKEN, quoteToken.address, 9000, 8300)
      expect(await test.protoFeeAccum(ZERO_TOKEN)).to.equal(14000)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(10800)

      await test.connect(owner).disburseProtocol(treasury, ZERO_TOKEN)

      expect(await test.getPaidFees(treasury, ZERO_TOKEN)).to.equal(14000)
      expect(await test.getPaidFees(treasury, quoteToken.address)).to.equal(0)
      expect(await test.protoFeeAccum(ZERO_TOKEN)).to.equal(0)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(10800)
    })

    it("disburse post", async() => {
      await test.testAccum(baseToken.address, quoteToken.address, 5000, 2500)
      await test.connect(owner).disburseProtocol(treasury, baseToken.address)

      await test.testAccum(baseToken.address, quoteToken.address, 3000, 6000)
      await test.connect(owner).disburseProtocol(treasury, quoteToken.address)
      
      expect(await test.getPaidFees(treasury, baseToken.address)).to.equal(5000)
      expect(await test.getPaidFees(treasury, quoteToken.address)).to.equal(8500)
      expect(await test.protoFeeAccum(baseToken.address)).to.equal(3000)
      expect(await test.protoFeeAccum(quoteToken.address)).to.equal(0)
    })
})
