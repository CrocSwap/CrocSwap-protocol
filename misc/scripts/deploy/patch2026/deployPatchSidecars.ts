/* Deploys fresh sidecar proxy contracts for the 2026 patch round (feb25 fixes
 * + Sherlock remediations consolidated on this branch).
 *
 * Covers every proxy that embeds the patched mixins -- including LongPath and
 * KnockoutFlagPath, which the feb25 round omitted even though both embed
 * LevelBook/LiquidityCurve (LongPath via MarketSequencer/TradeMatcher,
 * KnockoutFlagPath via KnockoutCounter), leaving the fee odometer bug
 * reachable through long-path swaps.
 *
 * Deploy-only: prints the new addresses to record in misc/constants/addrs.ts.
 * Installation is a separate governance step via installPatchSidecars.ts.
 */

import { inflateAddr, initChain } from '../../../libs/chain';

async function deploy() {
    let { addrs, chainId, wallet: authority } = initChain()
    console.log(`Deploying patch sidecars on chain ${chainId} for dex ${addrs.dex}`)

    let newAddrs = { ...addrs }

    newAddrs.cold = (await inflateAddr("ColdPath", "", authority)).address
    console.log(newAddrs)

    newAddrs.warm = (await inflateAddr("WarmPath", "", authority)).address
    console.log(newAddrs)

    newAddrs.long = (await inflateAddr("LongPath", "", authority)).address
    console.log(newAddrs)

    newAddrs.micro = (await inflateAddr("MicroPaths", "", authority)).address
    console.log(newAddrs)

    newAddrs.hot = (await inflateAddr("HotProxy", "", authority)).address
    console.log(newAddrs)

    newAddrs.knockout = (await inflateAddr("KnockoutLiqPath", "", authority)).address
    console.log(newAddrs)

    newAddrs.koCross = (await inflateAddr("KnockoutFlagPath", "", authority)).address

    console.log()
    console.log("Update misc/constants/addrs.ts for this chain with:")
    console.log(newAddrs)
}

deploy()
