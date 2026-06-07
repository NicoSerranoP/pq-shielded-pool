// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library PublicInputsParser {
    function parsePublicInputs(string memory raw, uint256 numberOfInputs) internal pure returns (uint256[] memory inputs) {
        bytes memory data = bytes(raw);
        uint256 value;
        uint256 inputCount;
        bool parsingNumber;

        inputs = new uint256[](numberOfInputs);

        for (uint256 i = 0; i < data.length; i++) {
            bytes1 ch = data[i];

            if (ch >= 0x30 && ch <= 0x39) {
                value = value * 10 + (uint8(ch) - 48);
                parsingNumber = true;
                continue;
            }

            if (ch == 0x0a || ch == 0x0d || ch == 0x20 || ch == 0x09) {
                if (parsingNumber) {
                    require(inputCount < numberOfInputs, "too many public inputs");
                    inputs[inputCount] = value;
                    inputCount++;
                    value = 0;
                    parsingNumber = false;
                }
                continue;
            }

            revert("invalid input char");
        }

        if (parsingNumber) {
            require(inputCount < numberOfInputs, "too many public inputs");
            inputs[inputCount] = value;
            inputCount++;
        }

        require(inputCount == numberOfInputs, "unexpected public input count");
    }

    function parsePublicInputsAndEncode(string memory raw, uint256 numberOfInputs)
        internal
        pure
        returns (bytes memory encodedInputs)
    {
        uint256[] memory parsed = parsePublicInputs(raw, numberOfInputs);

        if (numberOfInputs == 2) {
            uint256[2] memory inputs2;
            inputs2[0] = parsed[0];
            inputs2[1] = parsed[1];
            return abi.encode(inputs2);
        }

        if (numberOfInputs == 4) {
            uint256[4] memory inputs4;
            inputs4[0] = parsed[0];
            inputs4[1] = parsed[1];
            inputs4[2] = parsed[2];
            inputs4[3] = parsed[3];
            return abi.encode(inputs4);
        }

        revert("unsupported fixed input size");
    }
}
