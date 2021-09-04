pragma solidity >0.7.1;


interface AggregatorV3Interface {

  function decimals()
    external
    view
    returns (
      uint8
    );

  function description()
    external
    view
    returns (
      string memory
    );

  function version()
    external
    view
    returns (
      uint256
    );

  // getRoundData and latestRoundData should both raise "No data present"
  // if they do not have data to report, instead of returning unset values
  // which could be misinterpreted as actual reported values.
  function getRoundData(
    uint80 _roundId
  )
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );

  function latestRoundData()
    external
    view
    returns (
      uint80 roundId,
      int256 answer,
      uint256 startedAt,
      uint256 updatedAt,
      uint80 answeredInRound
    );

}

contract GasPriceFeed {
    int256 public currentGasPrice;
    uint256 private lastFetch;

    uint256 private constant INTERVAL = 24 * 60 * 60;

    // Network: Kovan
    // Aggregator: Fast Gas Gwei
    // Address: 0x7588b002aE4c2b946AF14e856d261fea7Fb9f6Cb
    AggregatorV3Interface private constant PRICEFEED = AggregatorV3Interface(0x7588b002aE4c2b946AF14e856d261fea7Fb9f6Cb);


    function getGasPrice() internal returns (int256) {
        uint256 currTime = block.timestamp;

        if (lastFetch + INTERVAL < currTime) {
            (
                , 
                int256 price,
                ,
                ,
                
            ) = PRICEFEED.latestRoundData();

            currentGasPrice = price;
            lastFetch = currTime;
        }

        return currentGasPrice;
    }
}