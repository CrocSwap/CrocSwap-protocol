// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './pool/ICrocSwapPoolImmutables.sol';
import './pool/ICrocSwapPoolState.sol';
import './pool/ICrocSwapPoolActions.sol';
import './pool/ICrocSwapPoolOwnerActions.sol';
import './pool/ICrocSwapPoolEvents.sol';

interface ICrocSwapPool is
    ICrocSwapPoolImmutables,
    ICrocSwapPoolState,
    ICrocSwapPoolActions,
    ICrocSwapPoolOwnerActions,
    ICrocSwapPoolEvents
{

}
