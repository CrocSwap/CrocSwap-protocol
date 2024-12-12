import { TestPool, makeTokenPool, Token, POOL_IDX, makeTokenTriangle, makeTokenSeq, makeTokenNext } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, MAX_PRICE, MIN_PRICE } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, BigNumberish, Signer } from 'ethers';
import { CrocMultiImpact } from '../typechain';
import { formatDirective, SwapPath } from './EncodeMultihop';
import { OrderDirectiveObj } from './EncodeOrder';

chai.use(solidity);

describe('Query Multi Impact', () => {
    let trader: Signer
    let traderAddress: string
    let pool_1: TestPool
    let pool_2: TestPool
    let pool_3_1: TestPool
    let pool_3_2: TestPool
    let test: CrocMultiImpact
    let token_W: Token
    let token_X: Token
    let token_Y: Token
    let token_Z_1: Token
    let token_Z_2: Token
    let balanceSnaps: Map<string, BigNumber> = new Map()
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
        [pool_1, pool_2, pool_3_1] = await makeTokenSeq()
        pool_3_2 = await makeTokenNext(pool_2, await pool_1.dex)

        // there's gotta be a better way
        token_W = pool_1.base
        token_X = pool_1.quote
        token_Y = pool_2.base != token_X ? pool_2.base : pool_2.quote
        token_Z_1 = pool_3_1.base != token_Y ? pool_3_1.base : pool_3_1.quote
        token_Z_2 = pool_3_2.base != token_Y ? pool_3_2.base : pool_3_2.quote

        for (let pool of [pool_1, pool_2, pool_3_1, pool_3_2]) {
            pool.useHotPath = true
            pool.liqQty = true
            await pool.initPool(feeRate, 0, 1, 1.5)
        }

        let factory = await ethers.getContractFactory("CrocMultiImpact")
        test = await factory.deploy((await pool_1.dex).address) as unknown as CrocMultiImpact
        trader = await pool_1.trader
        traderAddress = await trader.getAddress()
    })

    async function calcMultiPathImpact(paths: SwapPath[]): Promise<MultiHopImpactResult[]> {
        interface SwapHopAbi {
            token: string,
            poolIdx: number,
        }
        interface SwapPathAbi {
            hops: SwapHopAbi[],
            qty: BigNumber,
            isFixedOutput: boolean,
            limitQtyOverride?: BigNumber,
        }
        let pathsAbi: SwapPathAbi[] = []
        for (let path of paths) {
            let hopsAbi = path.hops.map(hop => {
                return { token: hop.token.address.toLowerCase(), poolIdx: hop.poolIdx }
            })
            pathsAbi.push({ hops: hopsAbi, qty: path.qty, isFixedOutput: path.isFixedOutput, limitQtyOverride: path.limitQtyOverride })
        }
        if (paths.length == 1) {
            const slip = await test.calcMultiHopImpact(pathsAbi[0].hops, pathsAbi[0].qty, pathsAbi[0].isFixedOutput)
            return [{ inputFlow: slip.inputFlow, outputFlow: slip.outputFlow }]
        } else {
            const slip = await test.calcMultiPathImpact(pathsAbi)
            return slip.map((s: any) => { return { inputFlow: s.inputFlow, outputFlow: s.outputFlow } })
        }
    }

    interface MultiHopImpactResult {
        inputFlow: BigNumber,
        outputFlow: BigNumber,
    }

    it("1 path 2 hop", async() => {
        await pool_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].outputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].outputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_X])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_W, token_X])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("1 path 2 hop fixed output", async() => {
        await pool_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].inputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].inputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_X])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_W, token_X])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(-outputDiff).to.eq(qty)
    })

    it("1 path 3 hop", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_2.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_Z_2, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].outputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].outputFlow
        order = formatDirective(paths)

        await snapBalances([token_Z_2, token_X])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_Z_2, token_X])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("1 path 3 hop low liq", async() => {
        await pool_1.testMintAmbient(500)
        await pool_2.testMintAmbient(500)
        await pool_3_2.testMintAmbient(500)

        let qty = BigNumber.from(10000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_Z_2, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].outputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].outputFlow
        order = formatDirective(paths)

        await snapBalances([token_Z_2, token_X])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_Z_2, token_X])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("1 path 4 hop", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX } ]
        }]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].outputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].outputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_Z_1])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_W, token_Z_1])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("1 path 4 hop backwards", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_Z_1, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_W, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].outputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].outputFlow
        order = formatDirective(paths)

        await snapBalances([token_Z_1, token_W])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_Z_1, token_W])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("1 path 4 hop fixed output", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].inputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].inputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_Z_1])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff] = await diffBalances([token_W, token_Z_1])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(-outputDiff).to.eq(qty)
    })

    it("2 path", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)
        await pool_3_2.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty: qty.div(BigNumber.from(2)), isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
            { qty: qty.div(BigNumber.from(2)), isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_2, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].outputFlow.add(BigNumber.from(-1))
        paths[1].limitQtyOverride = slip[1].outputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].outputFlow
        paths[1].limitQtyOverride = slip[1].outputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_Z_1, token_Z_2])
        await pool_1.testOrder(order)
        const [inputDiff, outputDiff1, outputDiff2] = await diffBalances([token_W, token_Z_1, token_Z_2])

        expect(inputDiff).to.eq(slip[0].inputFlow.add(slip[1].inputFlow))
        expect(outputDiff1).to.eq(slip[0].outputFlow)
        expect(outputDiff2).to.eq(slip[1].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("3 path separate fixed output", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)
        await pool_3_2.testMintAmbient(50000)

        let qty = BigNumber.from(100000)
        let paths: SwapPath[] = [
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_2, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].inputFlow.add(BigNumber.from(-1))
        paths[1].limitQtyOverride = slip[1].inputFlow.add(BigNumber.from(-1))
        paths[2].limitQtyOverride = slip[2].inputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].inputFlow
        paths[1].limitQtyOverride = slip[1].inputFlow
        paths[2].limitQtyOverride = slip[2].inputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])
        await pool_1.testOrder(order)
        const [inputDiff1, inputDiff2, outputDiff1, outputDiff2, outputDiff3] = await diffBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])

        expect(inputDiff1).to.eq(slip[0].inputFlow)
        expect(inputDiff2).to.eq(slip[1].inputFlow.add(slip[2].inputFlow))
        expect(outputDiff1).to.eq(slip[0].outputFlow)
        expect(outputDiff2).to.eq(slip[1].outputFlow)
        expect(outputDiff3).to.eq(slip[2].outputFlow)
        expect(-outputDiff1).to.eq(qty)
        expect(-outputDiff2).to.eq(qty)
        expect(-outputDiff3).to.eq(qty)
    })

    it("3 path separate fixed output low liq", async() => {
        await pool_1.testMintAmbient(500)
        await pool_2.testMintAmbient(500)
        await pool_3_1.testMintAmbient(500)
        await pool_3_2.testMintAmbient(500)

        let qty = BigNumber.from(100000)
        let paths: SwapPath[] = [
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_2, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)
        paths[0].limitQtyOverride = slip[0].inputFlow.add(BigNumber.from(-1))
        paths[1].limitQtyOverride = slip[1].inputFlow.add(BigNumber.from(-1))
        paths[2].limitQtyOverride = slip[2].inputFlow.add(BigNumber.from(-1))

        let order = formatDirective(paths)
        expect(pool_1.testOrder(order)).to.be.reverted

        paths[0].limitQtyOverride = slip[0].inputFlow
        paths[1].limitQtyOverride = slip[1].inputFlow
        paths[2].limitQtyOverride = slip[2].inputFlow
        order = formatDirective(paths)

        await snapBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])
        await pool_1.testOrder(order)
        const [inputDiff1, inputDiff2, outputDiff1, outputDiff2, outputDiff3] = await diffBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])

        expect(inputDiff1).to.eq(slip[0].inputFlow)
        expect(inputDiff2).to.eq(slip[1].inputFlow.add(slip[2].inputFlow))
        expect(outputDiff1).to.eq(slip[0].outputFlow)
        expect(outputDiff2).to.eq(slip[1].outputFlow)
        expect(outputDiff3).to.eq(slip[2].outputFlow)
        expect(-outputDiff1).to.eq(qty)
        expect(-outputDiff2).to.eq(qty)
        expect(-outputDiff3).to.eq(qty)
    })

    // For testing that a multihop impact is equivalent to a series of single swaps
    async function performEquivalentSingleSwaps(paths: SwapPath[]) {
        for (let path of paths) {
            let hops = path.hops.slice();
            if (path.isFixedOutput) {
                hops = hops.reverse()
            }

            let prevToken = hops[0].token
            let nextQty = path.qty;
            for (let h = 1; h < hops.length; h++) {
                const hop = hops[h]
                const base = prevToken.address.toLowerCase() < hop.token.address.toLowerCase() ? prevToken : hop.token
                const quote = prevToken.address.toLowerCase() < hop.token.address.toLowerCase() ? hop.token : prevToken
                let pool = new TestPool(base, quote, await pool_1.dex)
                let isBuy = Boolean((prevToken.address.toLowerCase() < hop.token.address.toLowerCase()) !== path.isFixedOutput)
                let inBaseQty = Boolean(prevToken.address.toLowerCase() < hop.token.address.toLowerCase())
                let qty = nextQty
                let limitPrice = isBuy ? MAX_PRICE : MIN_PRICE

                const outputBefore = await hop.token.balanceOf(traderAddress)
                await pool.testSwap(isBuy, inBaseQty, qty, limitPrice)
                const outputAfter = await hop.token.balanceOf(traderAddress)
                nextQty = outputAfter.sub(outputBefore)
                prevToken = hop.token
            }
        }
    }

    it("1 path 3 hop low liq equivalence", async() => {
        await pool_1.testMintAmbient(500)
        await pool_2.testMintAmbient(500)
        await pool_3_2.testMintAmbient(500)

        let qty = BigNumber.from(10000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_Z_2, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)

        await snapBalances([token_Z_2, token_X])
        await performEquivalentSingleSwaps(paths)
        const [inputDiff, outputDiff] = await diffBalances([token_Z_2, token_X])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })


    it("1 path 4 hop equivalence", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)

        await snapBalances([token_W, token_Z_1])
        await performEquivalentSingleSwaps(paths)
        const [inputDiff, outputDiff] = await diffBalances([token_W, token_Z_1])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("1 path 4 hop fixed output equivalence", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)

        await snapBalances([token_W, token_Z_1])
        await performEquivalentSingleSwaps(paths)
        const [inputDiff, outputDiff] = await diffBalances([token_W, token_Z_1])

        expect(inputDiff).to.eq(slip[0].inputFlow)
        expect(outputDiff).to.eq(slip[0].outputFlow)
        expect(-outputDiff).to.eq(qty)
    })

    it("2 path equivalence", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)
        await pool_3_2.testMintAmbient(50000)

        let qty = BigNumber.from(1000000)
        let paths: SwapPath[] = [
            { qty: qty.div(BigNumber.from(2)), isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
            { qty: qty.div(BigNumber.from(2)), isFixedOutput: false, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_2, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)

        await snapBalances([token_W, token_Z_1, token_Z_2])
        await performEquivalentSingleSwaps(paths)
        const [inputDiff, outputDiff1, outputDiff2] = await diffBalances([token_W, token_Z_1, token_Z_2])

        expect(inputDiff).to.eq(slip[0].inputFlow.add(slip[1].inputFlow))
        expect(outputDiff1).to.eq(slip[0].outputFlow)
        expect(outputDiff2).to.eq(slip[1].outputFlow)
        expect(inputDiff).to.eq(qty)
    })

    it("3 path separate fixed output equivalence", async() => {
        await pool_1.testMintAmbient(50000)
        await pool_2.testMintAmbient(50000)
        await pool_3_1.testMintAmbient(50000)
        await pool_3_2.testMintAmbient(50000)

        let qty = BigNumber.from(100000)
        let paths: SwapPath[] = [
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_2, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)

        await snapBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])
        await performEquivalentSingleSwaps(paths)
        const [inputDiff1, inputDiff2, outputDiff1, outputDiff2, outputDiff3] = await diffBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])

        expect(inputDiff1).to.eq(slip[0].inputFlow)
        expect(inputDiff2).to.eq(slip[1].inputFlow.add(slip[2].inputFlow))
        expect(outputDiff1).to.eq(slip[0].outputFlow)
        expect(outputDiff2).to.eq(slip[1].outputFlow)
        expect(outputDiff3).to.eq(slip[2].outputFlow)
        expect(-outputDiff1).to.eq(qty)
        expect(-outputDiff2).to.eq(qty)
        expect(-outputDiff3).to.eq(qty)
    })

    it("3 path separate fixed output low liq equivalence", async() => {
        await pool_1.testMintAmbient(500)
        await pool_2.testMintAmbient(500)
        await pool_3_1.testMintAmbient(500)
        await pool_3_2.testMintAmbient(500)

        let qty = BigNumber.from(100000)
        let paths: SwapPath[] = [
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_W, poolIdx: POOL_IDX },
                { token: token_X, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_2, poolIdx: POOL_IDX },
            ],},
            { qty: qty, isFixedOutput: true, hops: [
                { token: token_Y, poolIdx: POOL_IDX },
                { token: token_Z_1, poolIdx: POOL_IDX },
            ],},
        ]

        let slip = await calcMultiPathImpact(paths)

        await snapBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])
        await performEquivalentSingleSwaps(paths)
        const [inputDiff1, inputDiff2, outputDiff1, outputDiff2, outputDiff3] = await diffBalances([token_W, token_Y, token_X, token_Z_2, token_Z_1])

        expect(inputDiff1).to.eq(slip[0].inputFlow)
        expect(inputDiff2).to.eq(slip[1].inputFlow.add(slip[2].inputFlow))
        expect(outputDiff1).to.eq(slip[0].outputFlow)
        expect(outputDiff2).to.eq(slip[1].outputFlow)
        expect(outputDiff3).to.eq(slip[2].outputFlow)
        expect(-outputDiff1).to.eq(qty)
        expect(-outputDiff2).to.eq(qty)
        expect(-outputDiff3).to.eq(qty)
    })

    async function snapBalances(tokens: Token[]) {
        for (let token of tokens) {
            balanceSnaps.set(token.address, await token.balanceOf(traderAddress))
        }
    }

    async function diffBalances(tokens: Token[]): Promise<BigNumber[]> {
        let diffs: BigNumber[] = []
        for (let token of tokens) {
            diffs.push((balanceSnaps.get(token.address) || BigNumber.from(0)).sub(await token.balanceOf(traderAddress)))
        }
        return diffs
    }

})
