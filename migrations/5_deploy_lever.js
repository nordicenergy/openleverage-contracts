const PriceOracleV2 = artifacts.require("PriceOracleV2");
const Treasury = artifacts.require("Treasury");
const OpenLevDelegate = artifacts.require("OpenLevV1");
const OpenLevV1 = artifacts.require("OpenLevDelegator");

const ControllerV1 = artifacts.require("ControllerDelegator");

const utils = require("./util");

module.exports = async function (deployer, network, accounts) {
  if (utils.isSkip(network)) {
    return;
  }
  const uniswap = utils.uniswapAddress(network);
  await deployer.deploy(PriceOracleV2, uniswap, utils.deployOption(accounts));
  await deployer.deploy(OpenLevDelegate, utils.deployOption(accounts));
  await deployer.deploy(OpenLevV1, ControllerV1.address, uniswap, Treasury.address, PriceOracleV2.address, accounts[0], OpenLevDelegate.address, utils.deployOption(accounts));
};