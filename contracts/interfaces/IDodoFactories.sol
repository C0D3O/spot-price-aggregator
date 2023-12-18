// SPDX-License-Identifier: MIT

// solhint-disable one-contract-per-file

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDodoZoo {
    function getDODO(address baseToken, address quoteToken) external view returns (address);
}

interface IDVMFactory {
    function getDODOPool(address baseToken, address quoteToken) external view returns (address[] memory machines);
}
