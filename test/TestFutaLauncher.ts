import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { AbiCoder } from "@ethersproject/abi";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { CrocSwapDex, CrocAuctionQuery, TestFutaLauncher } from "../typechain";
import { BOOT_PROXY_IDX, COLD_PROXY_IDX } from "./SetupDex";
import { ZERO_ADDR } from "./FixedPoint";

chai.use(solidity);

const abi = new AbiCoder()

// From misc/constants/addrs.ts
const AUCTION_PROXY_IDX = 8750

// From AuctionCaller.sol
const AUCTION_INDEX = 42069

// From StorageLayout.sol — slot used by auctionContexts_ mapping in auctionDex
const AUCTION_CNTX_MAP_SLOT = 65555

// Arbitrary pool index (matches vanityFuta.ts deploy)
const POOL_IDX = 420

// -----------------------------------------------------------------------
// Test infrastructure helpers
// -----------------------------------------------------------------------

async function buildAuctionDex(): Promise<{ auctionDex: CrocSwapDex, auctionQuery: CrocAuctionQuery }> {
    const [auth] = await ethers.getSigners()

    const auctionDex = await (await ethers.getContractFactory("CrocSwapDex"))
        .connect(auth).deploy() as CrocSwapDex

    // ColdPath needed for any cold-path admin operations on the dex
    let proxy = await (await ethers.getContractFactory("ColdPath")).deploy()
    await auctionDex.protocolCmd(BOOT_PROXY_IDX,
        abi.encode(["uint8", "address", "uint16"], [21, proxy.address, COLD_PROXY_IDX]), true)

    // AuctionPath is the sidecar that handles all FUTA auction commands
    proxy = await (await ethers.getContractFactory("AuctionPath")).deploy()
    await auctionDex.protocolCmd(BOOT_PROXY_IDX,
        abi.encode(["uint8", "address", "uint16"], [21, proxy.address, AUCTION_PROXY_IDX]), true)

    const auctionQuery = await (await ethers.getContractFactory("CrocAuctionQuery"))
        .deploy(auctionDex.address) as CrocAuctionQuery

    return { auctionDex, auctionQuery }
}

// For tests that don't exercise lockLiquidity, we only need a trading DEX
// that satisfies the FutaLauncher constructor (CrocQuery.dex_() must return a valid address).
async function buildStubTradingDex() {
    const [auth] = await ethers.getSigners()
    const tradingDex = await (await ethers.getContractFactory("CrocSwapDex"))
        .connect(auth).deploy() as CrocSwapDex
    const crocQuery = await (await ethers.getContractFactory("CrocQuery"))
        .deploy(tradingDex.address)
    return { tradingDex, crocQuery }
}

// -----------------------------------------------------------------------
// Storage slot helpers for reading auctionDex internal state
// -----------------------------------------------------------------------

// Replicates AuctionLogic.hashAuctionPool (uses abi.encodePacked)
function hashAuctionPool(supplyToken: string, demandToken: string, auctioneer: string, salt: BigNumber): string {
    return ethers.utils.solidityKeccak256(
        ['address', 'address', 'address', 'uint256'],
        [supplyToken, demandToken, auctioneer, salt]
    )
}

// Replicates Solidity mapping slot derivation: keccak256(abi.encode(key, mappingSlot))
function mappingSlot(key: string, slot: number): BigNumber {
    const encoded = ethers.utils.defaultAbiCoder.encode(['bytes32', 'uint256'], [key, slot])
    return BigNumber.from(ethers.utils.keccak256(encoded))
}

// PricedAuctionContext storage layout (packed from LSB in a single 32-byte slot):
//   bits  0–31 : auctionEndTime_ (uint32)
//   bits 32–47 : startLevel_     (uint16)
//   bits 48–63 : stepSize_       (uint16)
//   bits 64–191: auctionSupply_  (uint128)
//   bits 192–207: protocolFee_   (uint16)
async function readAuctionContext(auctionDex: CrocSwapDex, tokenAddr: string, auctioneerAddr: string) {
    const auctionKey = hashAuctionPool(tokenAddr, ZERO_ADDR, auctioneerAddr, BigNumber.from(AUCTION_INDEX))
    const slot = mappingSlot(auctionKey, AUCTION_CNTX_MAP_SLOT)
    const raw = await auctionDex.readSlot(slot)
    return {
        auctionEndTime: raw.and(0xFFFFFFFF).toNumber(),
        startLevel:     raw.shr(32).and(0xFFFF).toNumber(),
        stepSize:       raw.shr(48).and(0xFFFF).toNumber(),
        auctionSupply:  raw.shr(64).and(BigNumber.from(2).pow(128).sub(1)),
        protocolFee:    raw.shr(192).and(0xFFFF).toNumber(),
    }
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("FutaLauncher regression tests", () => {
    let authority: SignerWithAddress
    let creator: SignerWithAddress
    let futa: TestFutaLauncher
    let auctionDex: CrocSwapDex
    let auctionQuery: CrocAuctionQuery

    const AUCTION_DURATION = 10          // seconds (short for tests)
    const TOKEN_SUPPLY  = BigNumber.from(2000)
    const AUCTION_SUPPLY = BigNumber.from(1000)

    // getMcapForLevel(startStep=2, supply=1000) = 1063 wei exactly.
    // Use 1064 (strictly greater as required by lockCreatorBid).
    //
    // Why 1064 and not more: with the parameter swap bug active, the auction
    // has startLevel=1 (from swapped auctionStepSize_=1). At that level
    // calcAuctionProceeds(1, bid) returns ~bid/1.032 tokens. If bid=5000 the
    // clearing level advances far above startLevel and shares exceed supply,
    // causing an underflow revert that masks the token-transfer bug. With
    // bid=1064 the clearing level stays at startLevel=1 and shares=1031,
    // which still exceeds supply=1000 — so the test still reverts with the
    // parameter bug active. After fixing the parameter bug (startLevel becomes
    // the correct 2), shares=999 ≤ 1000 and the test can proceed to check
    // whether the creator actually received those tokens.
    const CREATOR_BID_ETH = BigNumber.from(1064)

    beforeEach(async () => {
        [authority, creator] = await ethers.getSigners();

        ({ auctionDex, auctionQuery } = await buildAuctionDex())
        const { crocQuery } = await buildStubTradingDex()

        futa = await (await ethers.getContractFactory("TestFutaLauncher"))
            .deploy(auctionQuery.address, crocQuery.address, POOL_IDX) as TestFutaLauncher

        await futa.setTokenSupply(TOKEN_SUPPLY, AUCTION_SUPPLY)
        await futa.setAuctionDuration(AUCTION_DURATION)
    })

    // -----------------------------------------------------------------------
    // Bug: auction parameter ordering
    //
    // setAuctionSteps(auctionStartStep, auctionStepSize) stores values into:
    //   auctionStartStep_ — the reserve price level
    //   auctionStepSize_  — the bid granularity
    //
    // But initiateAuctionETH encodes them in swapped order:
    //   abi.encode(..., auctionStepSize_, auctionStartStep_)
    //
    // AuctionPath.initAuctionCmd decodes the same positions as:
    //   ..., uint16 startLevel, uint16 stepSize
    //
    // This means auctionStepSize_ lands in startLevel_ and vice versa.
    // -----------------------------------------------------------------------
    describe("Bug: initiateAuctionETH sends auctionStartStep/auctionStepSize in wrong order", () => {

        it("auction startLevel_ should match the first argument of setAuctionSteps", async () => {
            const START_STEP = 2
            const STEP_SIZE  = 1
            await futa.setAuctionSteps(START_STEP, STEP_SIZE)

            const tx = await futa.connect(creator).initializeTickerAuction("AA", { value: CREATOR_BID_ETH })
            const receipt = await tx.wait()
            const tokenAddr = receipt.events!.find((e: any) => e.event === "FutaAuctionOpen")!.args!.token

            const ctx = await readAuctionContext(auctionDex, tokenAddr, futa.address)
            expect(ctx.startLevel).to.equal(START_STEP)
        })

        it("auction stepSize_ should match the second argument of setAuctionSteps", async () => {
            const START_STEP = 2
            const STEP_SIZE  = 1
            await futa.setAuctionSteps(START_STEP, STEP_SIZE)

            const tx = await futa.connect(creator).initializeTickerAuction("BB", { value: CREATOR_BID_ETH })
            const receipt = await tx.wait()
            const tokenAddr = receipt.events!.find((e: any) => e.event === "FutaAuctionOpen")!.args!.token

            const ctx = await readAuctionContext(auctionDex, tokenAddr, futa.address)
            expect(ctx.stepSize).to.equal(STEP_SIZE)
        })
    })

    // -----------------------------------------------------------------------
    // Bug: claimCreatorBid calls TransferHelper.safeTransfer with wrong args
    //
    // Current (buggy) code:
    //   TransferHelper.safeTransfer(creator, msg.sender, endBal - startBal)
    //
    // safeTransfer signature is (address token, address to, uint256 value).
    // This passes `creator` (an EOA) as the token address and `msg.sender`
    // as the recipient. When called with an EOA as token, the low-level call
    // succeeds silently (no code = empty return data = accepted as success),
    // so no tokens are actually transferred and the creator receives nothing.
    //
    // Fix:
    //   TransferHelper.safeTransfer(token, creator, endBal - startBal)
    // -----------------------------------------------------------------------
    describe("Bug: claimCreatorBid passes wrong arguments to TransferHelper.safeTransfer", () => {

        it("creator receives tokens from their opening bid after auction ends", async () => {
            await futa.setAuctionSteps(2, 1)

            // Creator launches an auction and places opening bid
            const tx = await futa.connect(creator).initializeTickerAuction("CC", { value: CREATOR_BID_ETH })
            const receipt = await tx.wait()
            const tokenAddr = receipt.events!.find((e: any) => e.event === "FutaAuctionOpen")!.args!.token

            const futaToken = await ethers.getContractAt("FutaToken", tokenAddr)

            // Auction must expire before bid can be claimed
            await ethers.provider.send("evm_increaseTime", [AUCTION_DURATION + 1])
            await ethers.provider.send("evm_mine", [])

            expect(await futaToken.balanceOf(creator.address)).to.equal(0)

            // testClaimCreatorBid calls the internal claimCreatorBid in isolation,
            // bypassing lockLiquidity so we can test just the token transfer
            await futa.testClaimCreatorBid(tokenAddr)

            expect(await futaToken.balanceOf(creator.address)).to.be.gt(0)
        })
    })
})
