// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

library TextUtils {
    
    function isUpperCase(string memory str) internal pure returns (bool) {
        bytes memory strBytes = bytes(str);
        for (uint i = 0; i < strBytes.length; i++) {
            bytes1 char = strBytes[i];
            if (char < 0x41 || char > 0x5A) {
                return false;
            }
        }
        return true;
    }

    function makeCapitalized(string memory str) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(strBytes.length);
        for (uint i = 1; i < strBytes.length; i++) {
            bytes1 char = strBytes[i];
            // If uppercase letter, convert to lowercase by adding 32 to ASCII value
            if (char >= 0x41 && char <= 0x5A) {
                result[i] = bytes1(uint8(char) + 32);
            } else {
                result[i] = char;
            }
        }
        return string(result);
    }
}