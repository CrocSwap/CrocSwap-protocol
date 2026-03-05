# FUTA — Agent Guide

## What This Is

FUTA ("Fair Uncensorable Token Auctions") is a protocol for launching ERC20 tokens via single-price fixed-time auctions. A creator registers a ticker (e.g. `BTC`, `PEPE`), a new ERC20 is minted, and its entire auction supply is sold via Dutch auction on a forked CrocSwapDex instance. After the auction clears, proceeds are split between the protocol, the creator, and a permanently-locked liquidity position that seeds the token's trading market.

FUTA is deployed as a standalone contract (`FutaLauncher`) but lives inside the parent CrocSwap DEX repo because it shares libraries, interfaces, and the auction infrastructure built into that repo.

---

## Repo Layout

```
contracts/periphery/futa/          ← YOU ARE HERE (FUTA contracts)
  FutaLauncher.sol                 Main entry point
  FutaToken.sol                    ERC20 token + factory + beacon
  mixins/
    FutaBase.sol                   All mutable state
    TickerRegistry.sol             Ticker claim/blacklist logic
    TokenMinter.sol                ERC20 creation
    AuctionCaller.sol              Auction open/settle/bid logic
    LiquidityVault.sol             Post-auction liquidity seeding
  libraries/
    TextUtils.sol                  String validation utilities

contracts/libraries/AuctionLogic.sol     ← Core auction math (price levels, pro-rata, clearing)
contracts/mixins/AuctionHouse.sol        ← AuctionLedger + AuctionClearing + AuctionHouse (forked DEX mixins)
contracts/callpaths/AuctionPath.sol      ← AuctionHouse sidecar proxy, handles userCmd dispatch
contracts/lens/CrocAuctionQuery.sol      ← Read-only query interface for auction state
contracts/lens/CrocQuery.sol             ← Read-only query interface for trading DEX state

test/TestAuctionLogic.ts                 ← Unit tests for AuctionLogic math
test/TestAuctionLedger.ts                ← Integration tests for AuctionHouse ledger
misc/scripts/deploy/auction/vanityFuta.ts    ← Deploy + configure FutaLauncher
misc/scripts/deploy/auction/vanityAuction.ts ← Deploy AuctionPath/AuctionHouse DEX
```

---

## The Two DEX Instances

FUTA depends on **two separate CrocSwapDex deployments**:

| Variable | Role |
|---|---|
| `auctionDex_` | A **forked** CrocSwapDex that has `AuctionPath` installed as a sidecar proxy at slot `CrocSlots.AUCTION_PROXY_PATH`. Handles all auction operations (bid, refund, claim). |
| `tradingDex_` | The standard production CrocSwapDex. Receives the post-auction liquidity pool. |

FutaLauncher is resolved from the query contracts in the constructor:
```solidity
auctionDex_ = CrocAuctionQuery(crocAuctionQuery).dex_();
tradingDex_ = CrocQuery(crocQuery).dex_();
```

---

## Auction Lifecycle

### Phase 1 — Launch (`initializeTickerAuction`)

Called by anyone who wants to create a token. Requires an ETH payment (the creator's opening bid).

```
1. claimTicker(ticker)
   - Must be uppercase A–Z only
   - Must not be previously claimed or blacklisted
   - Records keccak256(ticker) → used; updates rolling tickerChain_ hash

2. mintPreAuction(ticker, tickerHash)
   - Deploys a new FutaToken via BeaconProxy (TokenFactory)
   - Mints tokenSupply_ tokens to FutaLauncher
   - Token transfers are locked (auctionUnlocked_ = false)
   - Records tickerHash → token address

3. initiateAuctionETH(token, auctionSupply)
   - Sends INIT_AUCTION to auctionDex via AuctionPath
   - Auction params: duration, step size, start level (reserve price), supply
   - Records msg.sender as auctionCreators_[token]

4. lockCreatorBid(token)
   - Requires msg.value > getMcapForLevel(auctionStartStep_, auctionSupply_)
   - Places creator's ETH as a bid with limitLevel = uint16.max (willing to pay any price)
   - Uses CREATOR_BID_INDEX (42002) as the bid salt
```

### Phase 2 — Auction (on `auctionDex_`)

The auction runs until `block.timestamp >= auctionEndTime`. External participants can call AuctionPath directly to:
- Place bids (`PLACE_BID`)
- Increase bids (`INCREASE_BID`)
- Modify bid price levels (`MODIFY_BID`, `MODIFY_AND_INCREASE_BID`)
- Cancel bids that fall below clearing level (`CANCEL_BID`)

**FUTA does not manage external bids** — users interact with the auction DEX directly. FutaLauncher only manages the creator's special bid.

### Phase 3 — Finalization (`finalizeAuction` and variants)

**Permissionless** — anyone can call once the auction has ended. Deterministic outcome, no admin needed.

```
1. refundAuctionETH(token)
   - Sends REFUND_AUCTION to auctionDex → receives ETH proceeds back
   - Calls divideAuctionProceeds():
       protocolCut  = proceeds × protocolFee_ / 1_000_000
       creatorCut   = (proceeds − protocolCut) × creatorFee_ / 1_000_000
       remainder    = stays in FutaLauncher for liquidity
   - Queries clearing price: CrocAuctionQuery.queryAuctionPrice(...)
   - Returns auctionPrice (uint128, X64.64 sqrt price)

2. claimCreatorBid(token)
   - Sends CLAIM_BID to auctionDex for creator's bid (CREATOR_BID_INDEX)
   - Creator receives their pro-rata token allocation at clearing price

3. lockLiquidity(token, auctionPrice)
   - initializePool() on tradingDex at auctionPrice
   - mintAmbientLiquidity() — full-range ETH+token liquidity
   - mintSingleSideLiquidity() — concentrated token-only liquidity above current tick
   - LP positions are permanently locked (no retrieval mechanism)

4. FutaToken.unlockTransfer()
   - Sets auctionUnlocked_ = true
   - Token is now freely transferable and tradeable
```

---

## Price Level System

All prices in the auction are represented as **discrete levels** rather than continuous values. The math lives in `AuctionLogic.sol`.

- **Sqrt price formula**: `getPriceForLevel(level)` returns a uint128 X64.64 fixed-point sqrt price.
  - Every 64 levels, sqrt price doubles → actual price quadruples.
  - Within a 64-level window, sqrt price is linearly interpolated using `1 + (N × 15625/1,000,000)`.
  - Level 0 is near-zero price; useful range starts around level 4096 (level `64×64` = sqrt price 1.0).

- **Market cap at level**: `getMcapForLevel(level, supply)` = `supply × sqrtPrice²` (in ETH). This is the total ETH required to fill the full auction supply at that level.

- **Clearing mechanics**: The auction tracks `cumLiftingBids_` (sum of all bid ETH at levels above clearing level). When cumulative bids exceed `getMcapForLevel(clearingLevel + stepSize, supply)`, the clearing level advances by one step. Bids at the exact clearing level are filled pro-rata.

- **Weak auction (reserve not met)**: If total demand never exceeds the reserve price's market cap, `calcReservePayout` is used — the seller receives partial ETH and unsold tokens are returned.

---

## Key Data Structures

All state lives in `FutaBase.sol`. Important fields:

```solidity
// DEX integration
address auctionDex_;             // Forked CrocSwapDex with AuctionPath sidecar
address tradingDex_;             // Production CrocSwapDex
address crocQuery_;
address crocAuctionQuery_;
uint256 poolIdx_;                // Pool template index for trading pools

// Token config (set once by protocol)
uint128 tokenSupply_;            // Total tokens minted per launch
uint128 auctionSupply_;          // Tokens placed in auction (≤ tokenSupply_)

// Fees (parts per million)
uint16 protocolFee_;             // Protocol's cut of ETH proceeds
uint16 creatorFee_;              // Creator's cut of ETH proceeds (currently unset/zero)

// Auction config (set by protocol, apply to all auctions)
uint32 auctionDuration_;         // Seconds the auction runs
uint16 auctionStepSize_;         // Price level granularity for bids
uint16 auctionStartStep_;        // Reserve price level

// Per-auction state
mapping(bytes32 => address) tokenTickers_;   // tickerHash → token address
mapping(bytes32 => bool)    tickerUsed_;     // tickerHash → claimed?
mapping(bytes32 => bool)    blacklist_;      // tickerHash → blacklisted?
mapping(address  => address) auctionCreators_; // token → creator address

// Immutable audit trail
bytes32 tickerChain_;            // Rolling keccak hash of all registered tickers

// Placeholder (unused)
uint32 creatorReward_;           // Reserved for future functionality; do not remove (storage layout)
```

---

## FutaToken

Each launched token is a **BeaconProxy** pointing to a shared `FutaToken` implementation via a `TokenBeacon`. This means all tokens can be upgraded atomically by upgrading the beacon.

**Transfer lock**: Tokens are non-transferable until finalization. Three addresses are pre-approved to bypass the lock:
- `futaVault_` (FutaLauncher)
- `auctionDex_`
- `tradingDex_`

The lock is removed by `unlockTransfer()`, called by FutaLauncher at the end of `finalizeAuction`.

`allowance()` returns `type(uint256).max` for pre-approved addresses (no approval needed).

---

## Protocol Configuration (admin only)

These must be set before any auctions can launch:

| Function | Who | Purpose |
|---|---|---|
| `setCroc(queryA, queryT, poolIdx)` | `protocolOnly(sudo)` | Set DEX + query addresses |
| `setAdmin(addr)` | `protocolOnly(sudo)` | Transfer admin |
| `setAuctionSteps(startStep, stepSize)` | `protocolOnly` | Reserve price + granularity |
| `setAuctionDuration(seconds)` | `protocolOnly` | Auction length |
| `setTokenSupply(total, auction)` | `protocolOnly` | Mint amounts |
| `setBlacklist(ticker, bool)` | `protocolOnly` | Block a ticker |

`protocolOnly(true)` = sudo (requires direct call from authority). `protocolOnly(false)` = non-sudo (can be called via governance proxy).

---

## External ABI (FutaLauncher public interface)

```
initializeTickerAuction(string ticker) payable
    → Launch an auction. msg.value must exceed reserve price market cap.

finalizeAuction(address tickerToken)
finalizeAuctionHash(bytes32 tickerHash)
finalizeAuctionTicker(string ticker)
finalizeAuctions(address[] tickerTokens)       // batch
finalizeAuctionTickers(string[] tickers)       // batch
finalizeAuctionHashes(bytes32[] tickerHashes)  // batch
    → All permissionless. Settle an ended auction and migrate liquidity.
```

---

## Magic Constants

Defined in `AuctionCaller.sol`:

```solidity
uint16 constant AUCTION_INDEX = 42069;      // auctionSalt for FutaLauncher-created auctions
uint16 constant CREATOR_BID_INDEX = 42002;  // bidSalt for creator's opening bid
```

These are arbitrary unique values that prevent collision with manually-placed bids. They have no other significance.

---

## Tests

Tests live in the **parent repo**, not in this directory:

```
test/TestAuctionLogic.ts    — Unit tests for AuctionLogic math (price levels, pro-rata, clearing)
test/TestAuctionLedger.ts  — Integration tests for AuctionHouse ledger (bid/cancel/claim/refund flows)
test/TestFutaLauncher.ts   — Regression tests for FutaLauncher (auction param ordering, creator bid transfer)
```

Run with Hardhat from the repo root:
```bash
npx hardhat test test/TestAuctionLogic.ts
npx hardhat test test/TestAuctionLedger.ts
```

---

## Deploy Scripts

```
misc/scripts/deploy/auction/vanityAuction.ts  — Deploy auctionDex (forked CrocSwapDex + AuctionPath)
misc/scripts/deploy/auction/vanityFuta.ts     — Deploy FutaLauncher, configure params
misc/scripts/deploy/auction/tmpFutaInit.ts    — One-time init helper
```

Example configuration from `vanityFuta.ts`:
```typescript
futa.setAuctionDuration(10)                                    // 10 seconds (testnet)
futa.setAuctionSteps(10, 100)                                  // startStep=10, stepSize=100
futa.setTokenSupply(69 × 10^27, 138 × 10^26)                  // 69B total, 13.8B auctioned (~20%)
```

---

## Known Issues / Open Questions

### `creatorFee_` not set
`creatorFee_` in FutaBase has no setter and is never initialized. It defaults to 0, meaning creators receive no ETH cut from auction proceeds. This is a placeholder for future functionality.

### `TextUtils.makeCapitalized` is buggy
The first character is left unchanged by this function. It is not currently called anywhere in the codebase, so this has no effect. Do not use it until fixed.

### No tests in this directory
The `test/` directory does not exist under `contracts/periphery/futa/`. All tests are in the parent repo's `test/` directory.

---

## Inheritance Chain

```
FutaLauncher
  └─ AuctionCaller
       └─ FutaBase
            └─ AgentMask        (authority_, reEntrantLock, protocolOnly)
  └─ TickerRegistry
       └─ FutaBase
  └─ TokenMinter
       └─ FutaBase
  └─ LiquidityVault
       └─ FutaBase
```

All state is in `FutaBase`. Mixins are pure behavior with no state of their own (except what they inherit from `FutaBase`).

---

## Invariants to Preserve

1. Once a ticker is claimed, `tickerUsed_[hash]` is permanently true. No re-registration.
2. `auctionCreators_[token]` is set exactly once, at auction creation. Never overwritten.
3. LP positions created in `lockLiquidity` are never retrieved. FutaLauncher has no withdrawal function for LP.
4. Token transfers are locked (`auctionUnlocked_ = false`) until `finalizeAuction` completes. Only `futaVault_`, `auctionDex_`, and `tradingDex_` can move tokens before unlock.
5. `tickerChain_` is a rolling hash of all registered tickers — it must only ever be extended, never reset.
6. `creatorReward_` in FutaBase must remain at its storage slot for EVM layout compatibility. Do not remove it even though it is unused.
