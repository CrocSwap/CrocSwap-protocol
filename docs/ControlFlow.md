# Control Flow Charts

This document contains flow chart visualizations for the common tradable operations on CrocSwap.

CrocSwap provides two different facilities for executing tradable actions
* *Long-Form Orders* - Lets users specify an arbitrary sequence of mints, burns, and swaps across an arbitrary number of pairs and pool types.
* *Simple Orders* - Gas-efficient way to execute a single tradable action (mint, burn or swap) on a single pool within a single pair.

## Long Form Orders

Long-form orders are called by the user encoding a full order directive. (see [Encoding Guide](./Encoding.md)). The CrocSwap smart contract
is called with the encoded directive using the `trade()` method. The below flowchart illustrates the control flow of the code that's executed
within this method call:

