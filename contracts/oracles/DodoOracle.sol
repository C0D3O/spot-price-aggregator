// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IOracle.sol";
import "../interfaces/IDodo.sol";
import "../interfaces/IDodoZoo.sol";
import "../libraries/Sqrt.sol";

contract DodoOracle is IOracle {
    using Sqrt for uint256;

    IDodoZoo public immutable dodoZoo;
    IERC20 private constant _NONE = IERC20(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
    IDodo private constant _ZERO_DODO = IDodo(0x0000000000000000000000000000000000000000);

    constructor(IDodoZoo _dodoZoo) {
        dodoZoo = _dodoZoo;
    }

    function getRate(IERC20 srcToken, IERC20 dstToken, IERC20 connector) external view override returns (uint256 rate, uint256 weight) {
        uint256 balanceSrc;
        uint256 balanceDst;
        if (connector == _NONE) {
            (rate, balanceSrc, balanceDst) = _getDodoInfo(srcToken, dstToken);
        } else {
            uint256 balanceConnector0;
            uint256 balanceConnector1;
            uint256 rateSrcConnector;
            uint256 rateConnectorDst;
            (rateSrcConnector, balanceSrc, balanceConnector0) = _getDodoInfo(srcToken, connector);
            (rateConnectorDst, balanceConnector1, balanceDst) = _getDodoInfo(connector, dstToken);
            if (balanceConnector0 > balanceConnector1) {
                balanceSrc = balanceSrc * balanceConnector1 / balanceConnector0;
            } else {
                balanceDst = balanceDst * balanceConnector0 / balanceConnector1;
            }
            rate = rateSrcConnector * rateConnectorDst / 1e18;
        }

        weight = (balanceSrc * balanceDst).sqrt();
    }

    function _getDodoInfo(IERC20 _srcToken, IERC20 _dstToken) internal view returns (uint256 rate, uint256 balanceSrc, uint256 balanceDst) {
        address srcToken = address(_srcToken);
        address dstToken = address(_dstToken);
        IDodo dodo = IDodo(dodoZoo.getDODO(srcToken, dstToken));
        bool isSrcBase = (dodo != _ZERO_DODO);
        if (!isSrcBase) dodo = IDodo(dodoZoo.getDODO(dstToken, srcToken));
        require(dodo != _ZERO_DODO, "DO: Dodo not found");

        uint256 price = dodo.getMidPrice();
        rate = isSrcBase? price : 1e36 / price;
        (uint256 balance0, uint256 balance1) = dodo.getExpectedTarget();
        (balanceSrc, balanceDst) = isSrcBase? (balance0, balance1) : (balance1, balance0);
    }
}
