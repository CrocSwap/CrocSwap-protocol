import { TestOracleHistory } from '../typechain/TestOracleHistory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { toFixedGrowth, fromFixedGrowth, toSqrtPrice } from './FixedPoint';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Oracle History', () => {
    let test: TestOracleHistory

   beforeEach("deploy", async () => {
       const factory = await ethers.getContractFactory("TestOracleHistory");
       test = (await factory.deploy()) as TestOracleHistory;
   })

   it("init", async () => {
       expect(await test.getLength()).to.eq(0)

       await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
       expect(await test.getLength()).to.eq(1)

       let series = await test.getCheckpoint(0)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(169406) // 2.58493 in 32-bit fixed ponint
       expect(series.twapPriceSum_).to.eq(0) // 10.25 price tick is 23273
       expect(series.vwapPriceSum_).to.eq(0) // 23273 * ambientGrowth_
       expect(series.liqLots_).to.eq(240580854) // Liquidity divided by 2^32
   })

   it("two in init block", async () => {
       await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
       await test.testCheckpoint(toSqrtPrice(11.5), toFixedGrowth(3.523), 512*1024*1024*1024*1024, 45000)
       expect(await test.getLength()).to.eq(2)
       
       let series = await test.getCheckpoint(0)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(169406) // 2.58493 in 32-bit fixed ponint
       expect(series.twapPriceSum_).to.eq(0) // 10.25 price tick is 23273
       expect(series.vwapPriceSum_).to.eq(0) // 23273 * ambientGrowth_
       expect(series.liqLots_).to.eq(240580854) // Liquidity divided by 2^32

       series = await test.getCheckpoint(1)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(230883) 
       expect(series.twapPriceSum_).to.eq(0) 
       expect(series.vwapPriceSum_).to.eq(1430754221) 
       expect(series.liqLots_).to.eq(151766695)  
   })

   it("three in init block", async () => {
       await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
       await test.testCheckpoint(toSqrtPrice(0.043), toFixedGrowth(2.95),  100*1024*1024*1024*1024, 45000)
       await test.testCheckpoint(toSqrtPrice(11.5), toFixedGrowth(3.523), 512*1024*1024*1024*1024, 45000)
       expect(await test.getLength()).to.eq(2)
    
       let series = await test.getCheckpoint(0)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(169406) // 2.58493 in 32-bit fixed ponint
       expect(series.twapPriceSum_).to.eq(0) // 10.25 price tick is 23273
       expect(series.vwapPriceSum_).to.eq(0) // 23273 * ambientGrowth_
       expect(series.liqLots_).to.eq(240580854) // Liquidity divided by 2^16 

       series = await test.getCheckpoint(1)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(230883) 
       expect(series.twapPriceSum_).to.eq(0) 
       expect(series.vwapPriceSum_).to.eq(-1934558236) 
       expect(series.liqLots_).to.eq(151766695)  
   })

   it("two sequence", async () => {
       await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
       await test.testCheckpoint(toSqrtPrice(0.043), toFixedGrowth(2.95), 512*1024*1024*1024*1024, 46025)
       expect(await test.getLength()).to.eq(2)
 
       let series = await test.getCheckpoint(0)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(169406)
       
       series = await test.getCheckpoint(1)
       expect(series.time_).to.eq(46025)
       expect(series.ambientGrowth_).to.eq(193331) 
       expect(series.twapPriceSum_).to.eq(23854825) 
       expect(series.vwapPriceSum_).to.eq(556806525) 
       expect(series.liqLots_).to.eq(132540006)  
   })

   it("three sequence", async () => {
       await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
       await test.testCheckpoint(toSqrtPrice(0.043), toFixedGrowth(2.95), 512*1024*1024*1024*1024, 46025)
       await test.testCheckpoint(toSqrtPrice(0.75), toFixedGrowth(3.4), 115*1024*1024*1024*1024, 48050)
       expect(await test.getLength()).to.eq(3)

       let series = await test.getCheckpoint(0)
       expect(series.time_).to.eq(45000)
       expect(series.ambientGrowth_).to.eq(169406)
    
       series = await test.getCheckpoint(1)
       expect(series.time_).to.eq(46025)
       expect(series.ambientGrowth_).to.eq(193331) 
    
       series = await test.getCheckpoint(2)
       expect(series.time_).to.eq(48050)
       expect(series.ambientGrowth_).to.eq(222822) 
       expect(series.twapPriceSum_).to.eq(-39867875) 
       expect(series.vwapPriceSum_).to.eq(-371216263) 
       expect(series.liqLots_).to.eq(33161215)     
    })

   it("block overwrite", async () => {
    await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
    await test.testCheckpoint(toSqrtPrice(0.043), toFixedGrowth(2.95), 512*1024*1024*1024*1024, 46025)
    await test.testCheckpoint(toSqrtPrice(0.75), toFixedGrowth(3.4), 115*1024*1024*1024*1024, 48050)
    await test.testCheckpoint(toSqrtPrice(2.5), toFixedGrowth(3.6), 256*1024*1024*1024*1024, 48050)
    expect(await test.getLength()).to.eq(3)

    let series = await test.getCheckpoint(0)
    expect(series.time_).to.eq(45000)
    expect(series.ambientGrowth_).to.eq(169406)
 
    series = await test.getCheckpoint(1)
    expect(series.time_).to.eq(46025)
    expect(series.ambientGrowth_).to.eq(193331) 
 
    series = await test.getCheckpoint(2)
    expect(series.time_).to.eq(48050)
    expect(series.ambientGrowth_).to.eq(235929) 
    expect(series.twapPriceSum_).to.eq(18028900) 
    expect(series.vwapPriceSum_).to.eq(434252079) 
    expect(series.liqLots_).to.eq(77175193)        
    })

    it("block return to normal", async () => {
        await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 1024*1024*1024*1024*1024, 45000)
        await test.testCheckpoint(toSqrtPrice(0.043), toFixedGrowth(2.95), 512*1024*1024*1024*1024, 46025)
        await test.testCheckpoint(toSqrtPrice(0.75), toFixedGrowth(3.4), 115*1024*1024*1024*1024, 48050)
        await test.testCheckpoint(toSqrtPrice(100.5), toFixedGrowth(3.6), 256*1024*1024*1024*1024, 48050)
        await test.testCheckpoint(toSqrtPrice(2.0), toFixedGrowth(8.5), 512*1024*1024*1024*1024, 52000)
        expect(await test.getLength()).to.eq(4)

        let series = await test.getCheckpoint(2)
        expect(series.time_).to.eq(48050)
        expect(series.liqLots_).to.eq(77175193)        

        series = await test.getCheckpoint(3)
        expect(series.time_).to.eq(52000)
        expect(series.ambientGrowth_).to.eq(557056) 
        expect(series.twapPriceSum_).to.eq(200135750) 
        expect(series.vwapPriceSum_).to.eq(15239170160) 
        expect(series.liqLots_).to.eq(318767104)        
    })

    // Represents current implementation which caps liquidity above 2^104
    it("liquidity ceiling", async () => {
        await test.testCheckpoint(toSqrtPrice(10.25), toFixedGrowth(2.5849341), 
            BigNumber.from(2).pow(106), 45000)
        expect(await test.getLength()).to.eq(1)

        let series = await test.getCheckpoint(0)
        expect(series.time_).to.eq(45000)
        expect(series.liqLots_).to.eq(BigNumber.from(2).pow(80).sub(1))
    })

    it("stop writing at end", async () => {
        expect(await test.getSeriesCapacity()).to.equal(4294967296)

        // 4294967296 is the series size
        await test.testSetNext(4294967296)
        let next = await test.testIndex(45000)
        expect(next.write).to.equal(4294967296-1)
        expect(next.prev).to.equal(4294967295-1)
        expect(next.next).to.equal(4294967295+1)

        await test.testSetNext(4294967290)
        next = await test.testIndex(45000)
        expect(next.write).to.equal(4294967290)
        expect(next.prev).to.equal(4294967289)
        expect(next.next).to.equal(4294967291)

        await test.testSetNext(4294967297)
        next = await test.testIndex(45000)
        expect(next.write).to.equal(4294967297-1)
        expect(next.prev).to.equal(4294967297-2)
        expect(next.next).to.equal(4294967297)
    })

    it("safe accum", async() => {
        let posSpill = BigNumber.from(2).pow(40)
        let negSpill = posSpill.mul(-1)
        expect(await test.testSafeAccumOver(posSpill)).to.equal(posSpill)
        expect(await test.testSafeAccumUnder(negSpill)).to.equal(negSpill)
    })

    it("cross event", async() => {
        // Initialize
        await test.testCheckpoint(toSqrtPrice(2.5), toFixedGrowth(1.0), 1024, 45000)

        // This won't cross because the intra-move tick cluster doesn't change (32 ticks cluster size).
        expect(await test.testCross(toSqrtPrice(1.0), toSqrtPrice(1.003))).to.equal(false)

        // These will always cross even though landing on the last oracle observation, because
        // the move is greater than two clusters.
        expect(await test.testCross(toSqrtPrice(2.481), toSqrtPrice(2.5))).to.equal(true)
        expect(await test.testCross(toSqrtPrice(2.514), toSqrtPrice(2.5))).to.equal(true)
        
        // Will not cross because it's a one cluster move and it's back to the last price
        expect(await test.testCross(toSqrtPrice(2.5052), toSqrtPrice(2.5))).to.equal(false)
        expect(await test.testCross(toSqrtPrice(2.4891), toSqrtPrice(2.5))).to.equal(false)

        // Will cross because it's a one cluster move and it's not at the last cluster
        expect(await test.testCross(toSqrtPrice(2.5), toSqrtPrice(2.5052))).to.equal(true)
        expect(await test.testCross(toSqrtPrice(2.5), toSqrtPrice(2.4891))).to.equal(true)
    })

    it("cross event negative price", async() => {
        // Initialize
        await test.testCheckpoint(toSqrtPrice(0.4), toFixedGrowth(1.0), 1024, 45000)

        // This won't cross because the intra-move tick cluster doesn't change (32 ticks cluster size).
        expect(await test.testCross(toSqrtPrice(0.9999), toSqrtPrice(1.003))).to.equal(false)

        // These will always cross even though landing on the last oracle observation, because
        // the move is greater than two clusters.
        expect(await test.testCross(toSqrtPrice(1/2.481), toSqrtPrice(1/2.5))).to.equal(true)
        expect(await test.testCross(toSqrtPrice(1/2.514), toSqrtPrice(1/2.5))).to.equal(true)
        
        expect(await test.testCross(toSqrtPrice(1/2.5052), toSqrtPrice(0.4))).to.equal(false)
        expect(await test.testCross(toSqrtPrice(1/2.4891), toSqrtPrice(0.4))).to.equal(false)
        expect(await test.testCross(toSqrtPrice(0.4), toSqrtPrice(1/2.5052))).to.equal(true)
        expect(await test.testCross(toSqrtPrice(0.4), toSqrtPrice(1/2.4891))).to.equal(true)
    })
})