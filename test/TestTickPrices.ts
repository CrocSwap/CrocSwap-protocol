import { TestTickMath } from '../typechain/TestTickMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice } from './FixedPoint';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Tick Math', () => {
    let math: TestTickMath

    beforeEach("deploy", async () => {
        const libFactory = await ethers.getContractFactory("TestTickMath");
        math = (await libFactory.deploy()) as TestTickMath
    })

    // Converts a raw price from the USDC-DAI pool to DAI/USDC display price
    function daiUsdcDisplayPrice (rawPrice: number) {
        // Adjust for decimal
        const decimalPrice = rawPrice / Math.pow(10, 12)
        // Invert price because we want DAI/USDC
        return 1.0/decimalPrice
    }

    // Converts a display price from the DAI/USDC pool to a raw price
    function invertDaiUsdcDisplayPrice (displayPrice: number) {
        // Invert price because we want USDC/DAI
        const decimalPrice = 1.0/displayPrice
        // Adjust for decimal
        return decimalPrice * Math.pow(10, 12)
    }

    it ("tick math test", async() => {
        /*
        Initial values:
        DAI/USDC pair
        price range 0.90593 - 1.10827
        bid Tick = 275296, priceRoot - 17522558883869441273675804
        askTick = 277312, priceRoot - 19380823352215258798212896

        USDT/USDC pair
        price range 0.90412 - 1.10605
        bidTick = -1008, price root - 17540112516508082354
        askTick = 1008, price root - 19400238544688794208
        */

        // Step 1: Start with askTick from USDT/USDC pair
        const usdtAskPrice = BigNumber.from("19400238544688794208")
        console.log("Step 1 - Starting price: ", fromSqrtPrice(usdtAskPrice))
        console.log("")

        // Step 2: Multiply askTick price root by 10^6
        const translateAskPrice = usdtAskPrice.mul(BigNumber.from(10).pow(6))
        console.log("Step 2 - Translated price: ", fromSqrtPrice(translateAskPrice))
        console.log("Translated price (dislay): ", daiUsdcDisplayPrice(fromSqrtPrice(translateAskPrice)))
        console.log("")

        // Step 3: Calculate new tick from price root
        const newAskTick = await math.testTick(translateAskPrice)
        console.log("Step 3 - New tick: ", newAskTick)
        console.log("")

        // Step 4: Compute price root from new tick
        const newAskPrice = await math.testRatio(newAskTick)
        console.log("Step 4 - New price from tick: ", fromSqrtPrice(newAskPrice))
        console.log("New price (display): ", daiUsdcDisplayPrice(fromSqrtPrice(newAskPrice)))
    })
})