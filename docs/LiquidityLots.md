# Liquidity Lots - Internal Representation

For all end-user facing interfaces CrocSwap represents both ambient and concentrated liquidity magnitudes in terms of $\sqrt{B*Q}$ where B and Q are the virtual reserves in terms of base and quote tokens for the curve, or LP position. Liquidity is always represented as a `uint128` type both internally and externally. 

Internally however, CrocSwap stores a truncated representation for concentrated liquidity in the context of individual ticks and liquidity positions. (Full precision `uint128` liquidity is still used for aggregate concentrated liquidity on any given curve.) This representation truncates the least significant 10 digits and the most significant 22 digits from the standard `uint128` liquidity representation.

![Liquidity Bits-3.jpeg](./Liquidity_Bits-3.jpeg)

To convert liquidity units to liquidity lots, one can shift right by 10 bits. Equivalent to multiplying by 1024). Therefore to avoid loss of precision, any liquidity argument that will be stored as liquidity lots should be passed as a multiple of 1024. 

For example a liquidity value of 51,200 can be cleanly converted to exactly 50 liquidity lots:

$51200 / 1024 = 50$

Whereas a liquidity value of 50,000 cannot be because it’s not exactly divisible by 1024:

$51200 / 1024 = 48.828...$

## Even Lots

Even though `uint96` lots is the native representation used to calculate liquidity changes across concentrated liquidity boundaries, liquidity lots are not internally stored with full precision.

Inside the tick data structure, the least significant bit of the liquidity lots value is reclaimed for an entirely separate purpose. (As a flag to indicate the presence of knockout liquidity.) This is done to tightly pack data to avoid the unnecessary use of storage slots. 

Therefore. when the liquidity change associated with a tick crossing is written to storage, the least significant bit must always be zero to avoid loss of precision. Similarly, when reading from storage, the least significant bit will be masked to zero in the returned value

![Liquidity Lots Storage.jpeg](./Liquidity_Lots_Storage.jpeg)

The stored value of liquidity lots at any given tick is a cumulative sum of the liquidity of all the active range orders with a boundary at that tick. Therefore whenever concentrated liquidity is minted or burned, its liquidity lots value must always have a zero in the least significant digit. Since the sum or difference of any even value is also even, this guarantees that the cumulative liquidity lots value in storage is also even (i.e. has a zero in the least significant digit).

![Binary Addition.jpeg](./Binary_Addition.jpeg)

Therefore every liquidity value supplied to mint or burn a concentrated liquidity position must be converted be converted not just to a liquidity lots value, but an *even valued lots* position. To avoid loss of precision the liquidity value must be zero in the least significant *11 digits* of the raw liquidity value. This is equivalent to being divisible 2048.

For example 4096 is a valid liquidity argument because it is divisible by 2048. It converts to 4 liquidity lots which can be cleanly stored in the storage schema without loss of precision.

Another example: 5120 is *not* a valid liquidity argument. It is not divisible by 2048. It is divisible by 1024 and cleanly converts to 5 liquidity lots. But the liquidity lots is odd-valued, and therefore cannot be written to the storage schema without loss of precision.

Another example: 4500 is *not* a valid liquidity argument. It is not divisible by 1024 (or 2048). Therefore it cannot be cleanly converted to liquidity lots representation without loss of precision.
