const hre = require('hardhat');
const { ethers } = hre;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, ether, assertRoughlyEqualValues, deployContract } = require('@1inch/solidity-utils');
const {
    tokens,
    deployParams: { AaveWrapperV2, Uniswap, UniswapV2 },
    defaultValues: { thresholdFilter },
} = require('./helpers.js');

describe('OffchainOracle', function () {
    async function initContracts () {
        const [deployer] = await ethers.getSigners();

        const uniswapV2LikeOracle = await deployContract('UniswapV2LikeOracle', [UniswapV2.factory, UniswapV2.initcodeHash]);
        const uniswapOracle = await deployContract('UniswapOracle', [Uniswap.factory]);
        const mooniswapOracle = await deployContract('MooniswapOracle', [tokens.oneInchLP1]);
        const wethWrapper = await deployContract('BaseCoinWrapper', [tokens.ETH, tokens.WETH]);
        const aaveWrapperV1 = await deployContract('AaveWrapperV1');
        const aaveWrapperV2 = await deployContract('AaveWrapperV2', [AaveWrapperV2.lendingPool]);
        await aaveWrapperV1.addMarkets([tokens.DAI]);
        await aaveWrapperV2.addMarkets([tokens.DAI]);
        const multiWrapper = await deployContract('MultiWrapper', [
            [
                wethWrapper,
                aaveWrapperV1,
                aaveWrapperV2,
            ],
            deployer,
        ]);

        return {
            uniswapV2LikeOracle,
            uniswapOracle,
            mooniswapOracle,
            multiWrapper,
            deployer,
        };
    }

    describe('built-in connectors', function () {
        async function initContractsAndOffchainOracle () {
            const { uniswapV2LikeOracle, uniswapOracle, mooniswapOracle, multiWrapper, deployer } = await initContracts();

            const offchainOracle = await deployContract('OffchainOracle', [
                multiWrapper,
                [
                    uniswapV2LikeOracle,
                    uniswapOracle,
                    mooniswapOracle,
                ],
                ['0', '1', '2'],
                [
                    tokens.NONE,
                    tokens.ETH,
                    tokens.WETH,
                    tokens.USDC,
                ],
                tokens.WETH,
                deployer.address,
            ]);

            const expensiveOffchainOracle = await deployContract('OffchainOracle', [
                multiWrapper,
                [
                    uniswapV2LikeOracle,
                    uniswapOracle,
                    mooniswapOracle,
                ],
                ['2', '2', '2'],
                [
                    ...Object.values(tokens).slice(0, 10),
                ],
                tokens.WETH,
                deployer.address,
            ]);

            const gasEstimator = await deployContract('GasEstimator');
            return { offchainOracle, expensiveOffchainOracle, gasEstimator };
        }

        it('WETH -> DAI', async function () {
            const { offchainOracle } = await loadFixture(initContractsAndOffchainOracle);
            const rate = await offchainOracle.getRateWithThreshold(tokens.WETH, tokens.DAI, true, thresholdFilter);
            expect(rate).to.gt(ether('1000'));
        });

        it('ETH -> DAI', async function () {
            const { offchainOracle } = await loadFixture(initContractsAndOffchainOracle);
            const rate = await offchainOracle.getRateWithThreshold(tokens.ETH, tokens.DAI, true, thresholdFilter);
            expect(rate).to.gt(ether('1000'));
        });

        it('USDC -> DAI', async function () {
            const { offchainOracle } = await loadFixture(initContractsAndOffchainOracle);
            const rate = await offchainOracle.getRateWithThreshold(tokens.USDC, tokens.DAI, true, thresholdFilter);
            expect(rate).to.gt(ether('980000000000'));
        });

        it('DAI -> aDAI', async function () {
            const { offchainOracle } = await loadFixture(initContractsAndOffchainOracle);
            const rate = await offchainOracle.getRateWithThreshold(tokens.DAI, tokens.aDAIV2, true, thresholdFilter);
            expect(rate).to.equal(ether('1'));
        });

        it('getRate(DAI -> LINK)', async function () {
            if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
            const { expensiveOffchainOracle, gasEstimator } = await loadFixture(initContractsAndOffchainOracle);
            const result = await gasEstimator.gasCost(
                await expensiveOffchainOracle.getAddress(),
                expensiveOffchainOracle.interface.encodeFunctionData('getRateWithThreshold', [tokens.DAI, tokens.LINK, true, thresholdFilter]),
            );
            assertRoughlyEqualValues(result.gasUsed, '814963', 1e-2);
        });

        it('getRateToEth(DAI)_ShouldHaveCorrectRate', async function () {
            const { offchainOracle } = await loadFixture(initContractsAndOffchainOracle);
            const expectedRate = await offchainOracle.getRateWithThreshold(tokens.DAI, tokens.WETH, true, thresholdFilter);
            const actualRate = await offchainOracle.getRateToEthWithThreshold(tokens.DAI, true, thresholdFilter);
            assertRoughlyEqualValues(expectedRate, actualRate, 1e-2);
        });

        it('getRateToEth(DAI)', async function () {
            if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
            const { expensiveOffchainOracle, gasEstimator } = await loadFixture(initContractsAndOffchainOracle);
            const result = await gasEstimator.gasCost(
                await expensiveOffchainOracle.getAddress(),
                expensiveOffchainOracle.interface.encodeFunctionData('getRateToEthWithThreshold', [tokens.DAI, true, thresholdFilter]),
            );
            assertRoughlyEqualValues(result.gasUsed, '1388108', 1e-2);
        });

        it('getRateDirect(DAI -> LINK)_ShouldHaveCorrectRate', async function () {
            const { offchainOracle } = await loadFixture(initContractsAndOffchainOracle);
            const expectedRate = await offchainOracle.getRateWithThreshold(tokens.DAI, tokens.LINK, true, thresholdFilter);
            const actualRate = await offchainOracle.getRateWithThreshold(tokens.DAI, tokens.LINK, false, thresholdFilter);
            assertRoughlyEqualValues(expectedRate, actualRate, 1e-2);
        });

        it('getRateDirect(DAI -> LINK)', async function () {
            if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
            const { expensiveOffchainOracle, gasEstimator } = await loadFixture(initContractsAndOffchainOracle);
            const result = await gasEstimator.gasCost(
                await expensiveOffchainOracle.getAddress(),
                expensiveOffchainOracle.interface.encodeFunctionData('getRateWithThreshold', [tokens.DAI, tokens.LINK, false, thresholdFilter]),
            );
            assertRoughlyEqualValues(result.gasUsed, '382698', 1e-1);
        });
    });

    describe('customConnectors', function () {
        async function initContractsAndOffchainOracle () {
            const { uniswapV2LikeOracle, uniswapOracle, multiWrapper, deployer } = await initContracts();

            const connectors = [
                tokens.ETH,
                tokens.WETH,
                tokens.USDC,
            ];
            const offchainOracle = await deployContract('OffchainOracle', [
                multiWrapper,
                [
                    uniswapV2LikeOracle,
                    uniswapOracle,
                ],
                ['0', '1'],
                [
                    tokens.NONE,
                    ...connectors,
                ],
                tokens.WETH,
                deployer.address,
            ]);

            const offchainOracleWithoutConnectors = await deployContract('OffchainOracle', [
                multiWrapper,
                [
                    uniswapV2LikeOracle,
                    uniswapOracle,
                ],
                ['0', '1'],
                [
                    tokens.NONE,
                ],
                tokens.WETH,
                deployer.address,
            ]);

            return { offchainOracle, offchainOracleWithoutConnectors, connectors };
        }

        it('WETH -> DAI', async function () {
            const { offchainOracle, offchainOracleWithoutConnectors, connectors } = await loadFixture(initContractsAndOffchainOracle);
            const rateWithCustomConnector = await offchainOracleWithoutConnectors.getRateWithCustomConnectors(tokens.WETH, tokens.DAI, true, connectors, thresholdFilter);
            const rate = await offchainOracle.getRateWithThreshold(tokens.WETH, tokens.DAI, true, thresholdFilter);
            expect(rateWithCustomConnector).to.gt(ether('1000'));
            assertRoughlyEqualValues(rateWithCustomConnector, rate, 1e-18);
        });

        it('ETH -> DAI', async function () {
            const { offchainOracle, offchainOracleWithoutConnectors, connectors } = await loadFixture(initContractsAndOffchainOracle);
            const rateWithCustomConnector = await offchainOracleWithoutConnectors.getRateWithCustomConnectors(tokens.ETH, tokens.DAI, true, connectors, thresholdFilter);
            const rate = await offchainOracle.getRateWithThreshold(tokens.ETH, tokens.DAI, true, thresholdFilter);
            expect(rateWithCustomConnector).to.gt(ether('1000'));
            assertRoughlyEqualValues(rateWithCustomConnector, rate, 1e-18);
        });

        it('USDC -> DAI', async function () {
            const { offchainOracle, offchainOracleWithoutConnectors, connectors } = await loadFixture(initContractsAndOffchainOracle);
            const rateWithCustomConnector = await offchainOracleWithoutConnectors.getRateWithCustomConnectors(tokens.USDC, tokens.DAI, true, connectors, thresholdFilter);
            const rate = await offchainOracle.getRateWithThreshold(tokens.USDC, tokens.DAI, true, thresholdFilter);
            expect(rateWithCustomConnector).to.gt(ether('980000000000'));
            assertRoughlyEqualValues(rateWithCustomConnector, rate, 1e-18);
        });

        it('DAI -> aDAI', async function () {
            const { offchainOracle, offchainOracleWithoutConnectors, connectors } = await loadFixture(initContractsAndOffchainOracle);
            const rateWithCustomConnector = await offchainOracleWithoutConnectors.getRateWithCustomConnectors(tokens.DAI, tokens.aDAIV2, true, connectors, thresholdFilter);
            const rate = await offchainOracle.getRateWithThreshold(tokens.DAI, tokens.aDAIV2, true, thresholdFilter);
            expect(rateWithCustomConnector).to.equal(ether('1'));
            assertRoughlyEqualValues(rateWithCustomConnector, rate, 1e-18);
        });
    });

    describe('Some features', function () {
        it('should work when overflow happens in _getRateImpl method', async function () {
            const { multiWrapper, deployer } = await initContracts();

            const simpleOracleMock = await deployContract('SimpleOracleMock', ['608424427628800532964876503129856304465282478', '2']);
            const offchainOracle = await deployContract('OffchainOracle', [
                multiWrapper,
                [
                    simpleOracleMock,
                ],
                ['0'],
                [
                    tokens.NONE,
                ],
                tokens.WETH,
                deployer.address,
            ]);

            expect(await offchainOracle.getRateToEth(tokens.DAI, true)).not.to.be.reverted;
        });
    });
});
