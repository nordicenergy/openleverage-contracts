const utils = require("./utils/OpenLevUtil");
const {
  toWei,
  last8,
  prettyPrintBalance,
  initEnv,
  checkAmount,
  printBlockNum,
  wait,
  assertPrint,
  assertThrows
} = require("./utils/OpenLevUtil");
const {advanceMultipleBlocks, toBN} = require("./utils/EtheUtil");
const OpenLevV1 = artifacts.require("OpenLevV1");
const OpenLevDelegator = artifacts.require("OpenLevDelegator");

const MockERC20 = artifacts.require("MockERC20");
const Treasury = artifacts.require("TreasuryDelegator");
const TreasuryImpl = artifacts.require("Treasury");
const m = require('mocha-logger');
const LPErc20Delegator = artifacts.require("LPoolDelegator");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const MockPriceOracle = artifacts.require("MockPriceOracle");
const TestToken = artifacts.require("MockERC20");
const InterestModel = artifacts.require("JumpRateModel");

contract("OpenLev", async accounts => {

  // components
  let openLev;
  let openLevErc20;
  let treasury;
  let uniswapFactory;
  let priceOracle;

  // roles
  let admin = accounts[0];
  let saver = accounts[1];
  let trader = accounts[2];
  let dev = accounts[3];
  let controller = accounts[3];
  let liquidator1 = accounts[8];
  let liquidator2 = accounts[9];

  beforeEach(async () => {

    // runs once before the first test in this block
    let controller = await utils.createController(admin);
    m.log("Created Controller", last8(controller.address));

    openLevErc20 = await TestToken.new('OpenLevERC20', 'OLE');
    let usdt = await TestToken.new('Tether', 'USDT');

    let tokenA = await TestToken.new('TokenA', 'TKA');
    let tokenB = await TestToken.new('TokenB', 'TKB');

    uniswapFactory = await utils.createUniswapFactory(admin);
    m.log("Created UniswapFactory", last8(uniswapFactory.address));

    let pair = await MockUniswapV2Pair.new(tokenA.address, tokenB.address, toWei(10000), toWei(10000));
    m.log("Created MockUniswapV2Pair (", last8(await pair.token0()), ",", last8(await pair.token1()), ")");

    // m.log("getReserves:", JSON.stringify(await pair.getReserves(), 0 ,2));
    await uniswapFactory.addPair(pair.address);

    // Making sure the pair has been added correctly in mock
    let gotPair = await MockUniswapV2Pair.at(await uniswapFactory.getPair(tokenA.address, tokenB.address));
    assert.equal(await pair.token0(), await gotPair.token0());
    assert.equal(await pair.token1(), await gotPair.token1());

    let treasuryImpl = await TreasuryImpl.new();
    treasury = await Treasury.new(uniswapFactory.address, openLevErc20.address, usdt.address, 50, dev, controller.address, treasuryImpl.address);

    priceOracle = await MockPriceOracle.new();
    let delegatee = await OpenLevV1.new();
    openLev = await OpenLevDelegator.new(controller.address, uniswapFactory.address, treasury.address, priceOracle.address, "0x0000000000000000000000000000000000000000", accounts[0], delegatee.address);
    await controller.setOpenLev(openLev.address);
    await controller.setLPoolImplementation((await utils.createLPoolImpl()).address);
    await controller.setInterestParam(toBN(90e16).div(toBN(2102400)), toBN(10e16).div(toBN(2102400)), toBN(20e16).div(toBN(2102400)), 50e16 + '');

    await controller.createLPoolPair(tokenA.address, tokenB.address, 3000); // 30% margin ratio by default
    assert.equal(3000, (await openLev.markets(0)).marginRatio);

    await openLev.setDefaultMarginRatio(1500, {from: admin});
    assert.equal(1500, await openLev.defaultMarginRatio());

    assert.equal(await openLev.numPairs(), 1, "Should have one active pair");
    m.log("Reset OpenLev instance: ", last8(openLev.address));
  });

  // it("LONG Token0, Close", async () => {
  //   let pairId = 0;
  //   await printBlockNum();
  //   let token0 = await MockERC20.at(await openLev.token0(pairId));
  //   let token1 = await MockERC20.at(await openLev.token1(pairId));
  //   m.log("OpenLev.token0() = ", last8(token0.address));
  //   m.log("OpenLev.token1() = ", last8(token1.address));
  //
  //   // provide some funds for trader and saver
  //   await utils.mint(token1, trader, 10000);
  //   checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
  //
  //   await utils.mint(token1, saver, 10000);
  //   checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
  //
  //   // Trader to approve openLev to spend
  //   let deposit = utils.toWei(400);
  //   await token1.approve(openLev.address, deposit, {from: trader});
  //
  //   // Saver deposit to pool1
  //   let saverSupply = utils.toWei(1000);
  //   let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
  //   await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
  //   await pool1.mint(saverSupply, {from: saver});
  //
  //   let poo1Available = await openLev.pool1Available(pairId);
  //   m.log("Available For Borrow at Pool 1: ", poo1Available);
  //   //assert.strictEqual(poo1Available, utils.amountIn18d(400));
  //
  //   let borrow = utils.toWei(500);
  //   m.log("toBorrow from Pool 1: \t", borrow);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 100000000);
  //   await priceOracle.setPrice(token1.address, token0.address, 100000000);
  //   let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //   // Check events
  //   let fees = tx.logs[0].args.fees;
  //   m.log("Fees", fees);
  //   assert.equal(fees, 2700000000000000000);
  //
  //   assertPrint("atPrice:", '100000000', tx.logs[0].args.atPrice);
  //   assertPrint("priceDecimals:", '8', tx.logs[0].args.priceDecimals);
  //   assertPrint("Insurance of Pool1:", '891000000000000000', (await openLev.markets(pairId)).pool1Insurance);
  //
  //   // Check active trades
  //   let numPairs = await openLev.numPairs();
  //
  //   let numTrades = 0;
  //   for (let i = 0; i < numPairs; i++) {
  //     let trade = await openLev.getActiveTrade(trader, i, 0);
  //     m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
  //     assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
  //     assert.equal(trade.held, 821147572990716389330, "");
  //     numTrades++;
  //   }
  //
  //   assert.equal(numTrades, 1, "Should have one trade only");
  //
  //   // Check balances
  //   checkAmount("Trader Balance", 9600000000000000000000, await token1.balanceOf(trader), 18);
  //   checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
  //   checkAmount("OpenLev Balance", 821147572990716389330, await token0.balanceOf(openLev.address), 18);
  //
  //   // Market price change, then check margin ratio
  //   await priceOracle.setPrice(token0.address, token1.address, 120000000);
  //   let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
  //   assert.equal(marginRatio_1.current.toString(), 9707);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 65000000);
  //   let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
  //   assert.equal(marginRatio_2.current.toString(), 674);
  //
  //   let trade = await openLev.getActiveTrade(trader, 0, 0);
  //   m.log("Trade:", JSON.stringify(trade, 0, 2));
  //   await assertThrows(openLev.closeTrade(0, 0, "821147572990716389330", 0, {from: trader}), "Margin ratio is lower than limit");
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 120000000);
  //   let tx_close = await openLev.closeTrade(0, 0, "821147572990716389330", 0, {from: trader});
  //   m.log("held at close", tx_close.held);
  //
  //   assertPrint("atPrice:", '100000000', tx_close.logs[0].args.atPrice);
  //   assertPrint("priceDecimals:", '8', tx_close.logs[0].args.priceDecimals);
  //
  //   // Check contract held balance
  //   checkAmount("OpenLev Balance", 891000000000000000, await token1.balanceOf(openLev.address), 18);
  //   checkAmount("Trader Balance", 9854631697978553565817, await token1.balanceOf(trader), 18);
  //   checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
  //   checkAmount("Treasury Balance", 1650506621711339942, await token0.balanceOf(treasury.address), 18);
  //   await printBlockNum();
  // })
  //
  // it("LONG Token0, Price Drop, Add deposit, Close", async () => {
  //   let pairId = 0;
  //   await printBlockNum();
  //   let token0 = await MockERC20.at(await openLev.token0(pairId));
  //   let token1 = await MockERC20.at(await openLev.token1(pairId));
  //   m.log("OpenLev.token0() = ", last8(token0.address));
  //   m.log("OpenLev.token1() = ", last8(token1.address));
  //
  //   // provide some funds for trader and saver
  //   await utils.mint(token1, trader, 10000);
  //   checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
  //
  //   await utils.mint(token1, saver, 10000);
  //   checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
  //
  //   // Trader to approve openLev to spend
  //   let deposit = utils.toWei(400);
  //   await token1.approve(openLev.address, deposit, {from: trader});
  //
  //   // Saver deposit to pool1
  //   let saverSupply = utils.toWei(1000);
  //   let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
  //   await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
  //   await pool1.mint(saverSupply, {from: saver});
  //
  //   let poo1Available = await openLev.pool1Available(pairId);
  //   m.log("Available For Borrow at Pool 1: ", poo1Available);
  //   //assert.strictEqual(poo1Available, utils.amountIn18d(400));
  //
  //   let borrow = utils.toWei(500);
  //   m.log("toBorrow from Pool 1: \t", borrow);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 100000000);
  //
  //   let tx = await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //   // Check events
  //   let fees = tx.logs[0].args.fees;
  //   m.log("Fees", fees);
  //   assert.equal(fees, 2700000000000000000);
  //
  //   // Check active trades
  //   let numPairs = await openLev.numPairs();
  //
  //   let numTrades = 0;
  //   for (let i = 0; i < numPairs; i++) {
  //     let trade = await openLev.getActiveTrade(trader, i, 0);
  //     m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
  //     assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
  //     assert.equal(trade.held, 821147572990716389330, "");
  //     numTrades++;
  //   }
  //
  //   assert.equal(numTrades, 1, "Should have one trade only");
  //
  //   // Check balances
  //   checkAmount("Trader Balance", 9600000000000000000000, await token1.balanceOf(trader), 18);
  //   checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
  //   checkAmount("OpenLev Balance", 821147572990716389330, await token0.balanceOf(openLev.address), 18);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 65000000);
  //   await priceOracle.setPrice(token1.address, token0.address, 135000000);
  //   let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio before adding deposit:", marginRatio_2.current / 100, "%");
  //   assert.equal(marginRatio_2.current.toString(), 674);
  //
  //   let moreDeposit = utils.toWei(200);
  //   await token1.approve(openLev.address, moreDeposit, {from: trader});
  //   tx = await openLev.marginTrade(0, false, true, moreDeposit, 0, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //   let marginRatio_3 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   trade = await openLev.getActiveTrade(trader, 0, 0);
  //   m.log("Trade.held:", trade.held);
  //   m.log("Trade.deposited:", trade.deposited);
  //   m.log("Trade.depositFixedValue:", trade.depositFixedValue);
  //   m.log("Trade.marketValueOpen:", trade.marketValueOpen);
  //
  //   m.log("Margin Ratio after deposit:", marginRatio_3.current, marginRatio_3.marketLimit);
  //   assert.equal(marginRatio_3.current.toString(), 3208); // TODO check
  //
  //   // Close trade
  //   let tx_close = await openLev.closeTrade(0, 0, "821147572990716389330", 0, {from: trader});
  //
  //   // Check contract held balance
  //   checkAmount("OpenLev Balance", 1089000000000000000, await token1.balanceOf(openLev.address), 18);
  //   checkAmount("Trader Balance", 9750581914760217233904, await token1.balanceOf(trader), 18);
  //   checkAmount("Treasury Balance", 2211000000000000000, await token1.balanceOf(treasury.address), 18);
  //   checkAmount("Treasury Balance", 1650506621711339942, await token0.balanceOf(treasury.address), 18);
  //   await printBlockNum();
  // })
  //
  // it("LONG Token0, Liquidate", async () => {
  //   let pairId = 0;
  //
  //   let token0 = await MockERC20.at(await openLev.token0(pairId));
  //   let token1 = await MockERC20.at(await openLev.token1(pairId));
  //   m.log("OpenLev.token0() = ", last8(token0.address));
  //   m.log("OpenLev.token1() = ", last8(token1.address));
  //
  //   // provide some funds for trader and saver
  //   await utils.mint(token1, trader, 10000);
  //   m.log("Trader", last8(trader), "minted", await token1.symbol(), await token1.balanceOf(trader));
  //
  //   await utils.mint(token1, saver, 10000);
  //   m.log("Saver", last8(saver), "minted", await token1.symbol(), await token1.balanceOf(saver));
  //
  //   // Trader to approve openLev to spend
  //   let deposit = utils.toWei(400);
  //   await token1.approve(openLev.address, deposit, {from: trader});
  //
  //   // Saver deposit to pool1
  //   let saverSupply = utils.toWei(1000);
  //   let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
  //   await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
  //   await pool1.mint(saverSupply, {from: saver});
  //
  //   let poo1Available = await openLev.pool1Available(pairId);
  //   m.log("Available For Borrow at Pool 1: ", poo1Available);
  //   //assert.strictEqual(poo1Available, utils.amountIn18d(400));
  //
  //   let borrow = utils.toWei(500);
  //   m.log("toBorrow from Pool 1: \t", borrow);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 100000000);
  //   await priceOracle.setPrice(token1.address, token0.address, 100000000);
  //   await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //   // Check events
  //   //assert.equal(tx.logs[0].event, "Transfer");
  //
  //   // Check active trades
  //   let numPairs = await openLev.numPairs();
  //
  //   let numTrades = 0;
  //   for (let i = 0; i < numPairs; i++) {
  //     let trade = await openLev.getActiveTrade(trader, i, 0);
  //     m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
  //     assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
  //     assert.equal(trade.held, 821147572990716389330, "");
  //     numTrades++;
  //   }
  //
  //   assert.equal(numTrades, 1, "Should have one trade only");
  //
  //   // Check contract held balance
  //   assert.equal(await token0.balanceOf(openLev.address), 821147572990716389330);
  //
  //   // Check treasury
  //   assert.equal('1809000000000000000', (await token1.balanceOf(treasury.address)).toString());
  //
  //   // Market price change, then check margin ratio
  //   await priceOracle.setPrice(token0.address, token1.address, 120000000);
  //   let marginRatio_1 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
  //   assert.equal(marginRatio_1.current.toString(), 9707);
  //
  //   await advanceMultipleBlocks(4000);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 65000000);
  //   let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
  //   assert.equal(marginRatio_2.current.toString(), 673);
  //
  //   // Close trade
  //   m.log("Mark trade liquidatable ... ");
  //   await openLev.liqMarker(trader, 0, 0, {from: liquidator1});
  //
  //   m.log("Liquidating trade ... ");
  //   await openLev.liquidate(trader, 0, 0, {from: liquidator2});
  //
  //   assertPrint("Insurance of Pool0:", '812936097260809225', (await openLev.markets(pairId)).pool0Insurance);
  //   assertPrint("Insurance of Pool1:", '891000000000000000', (await openLev.markets(pairId)).pool1Insurance);
  //   checkAmount("OpenLev Balance", 812936097260809225, await token0.balanceOf(openLev.address), 18);
  //   checkAmount("OpenLev Balance", 891000000000000000, await token1.balanceOf(openLev.address), 18);
  //   checkAmount("Treasury Balance", 1809000000000000000, await token1.balanceOf(treasury.address), 18);
  //   checkAmount("Treasury Balance", 1650506621711339942, await token0.balanceOf(treasury.address), 18);
  // })
  //
  // it("LONG Token0, Reset Liquidate ", async () => {
  //   let pairId = 0;
  //
  //   let token0 = await MockERC20.at(await openLev.token0(pairId));
  //   let token1 = await MockERC20.at(await openLev.token1(pairId));
  //
  //   // provide some funds for trader and saver
  //   await utils.mint(token1, trader, 10000);
  //   m.log("Trader", last8(trader), "minted", await token1.symbol(), await token1.balanceOf(trader));
  //
  //   await utils.mint(token1, saver, 10000);
  //   m.log("Saver", last8(saver), "minted", await token1.symbol(), await token1.balanceOf(saver));
  //
  //   // Trader to approve openLev to spend
  //   let deposit = utils.toWei(400);
  //   await token1.approve(openLev.address, deposit, {from: trader});
  //
  //   // Saver deposit to pool1
  //   let saverSupply = utils.toWei(1000);
  //   let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
  //   await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
  //   await pool1.mint(saverSupply, {from: saver});
  //
  //
  //   let borrow = utils.toWei(500);
  //   m.log("toBorrow from Pool 1: \t", borrow);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 100000000);
  //   await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //
  //   await advanceMultipleBlocks(10);
  //
  //   await priceOracle.setPrice(token0.address, token1.address, 65000000);
  //   let marginRatio_2 = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio:", marginRatio_2.current / 100, "%");
  //   assert.equal(marginRatio_2.current.toString(), 674);
  //
  //   m.log("Mark trade liquidatable ... ");
  //   await openLev.liqMarker(trader, 0, 0, {from: liquidator1});
  //
  //   m.log("Reset trade liquidate... ");
  //   await priceOracle.setPrice(token0.address, token1.address, 80000000);
  //   let marginRatioReset = await openLev.marginRatio(trader, 0, 0, {from: saver});
  //   m.log("Margin Ratio Reset:", marginRatioReset.current / 100, "%");
  //   assert.equal(marginRatioReset.current.toString(), 3138);
  //   await openLev.liqMarkerReset(trader, 0, 0, {from: liquidator1});
  //
  //   let trade = await openLev.getActiveTrade(trader, 0, 0);
  //   assert.equal(trade[4], "0x0000000000000000000000000000000000000000");
  //   assert.equal(trade[5], 0);
  //
  // })
  //
  // it("Long Token1, Close", async () => {
  //   let pairId = 0;
  //   await printBlockNum();
  //   let token0 = await MockERC20.at(await openLev.token0(pairId));
  //   let token1 = await MockERC20.at(await openLev.token1(pairId));
  //   m.log("OpenLev.token0() = ", last8(token0.address));
  //   m.log("OpenLev.token1() = ", last8(token1.address));
  //
  //   // provide some funds for trader and saver
  //   await utils.mint(token0, trader, 10000);
  //   checkAmount(await token0.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token0.balanceOf(trader), 18);
  //
  //   await utils.mint(token0, saver, 10000);
  //   checkAmount(await token0.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token0.balanceOf(saver), 18);
  //
  //   // Trader to approve openLev to spend
  //   let deposit = utils.toWei(400);
  //   await token0.approve(openLev.address, deposit, {from: trader});
  //
  //   // Saver deposit to pool1
  //   let saverSupply = utils.toWei(1000);
  //   let pool0 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool0);
  //   await token0.approve(await pool0.address, utils.toWei(1000), {from: saver});
  //   await pool0.mint(saverSupply, {from: saver});
  //
  //   let pool0Available = await openLev.pool0Available(pairId);
  //   m.log("Available For Borrow at Pool 1: ", pool0Available);
  //
  //   let borrow = utils.toWei(500);
  //   m.log("toBorrow from Pool 1: \t", borrow);
  //
  //   await priceOracle.setPrice(token1.address, token0.address, 100000000);
  //   await priceOracle.setPrice(token0.address, token1.address, 100000000);
  //   let tx = await openLev.marginTrade(0, true, false, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //   // Check events
  //   let fees = tx.logs[0].args.fees;
  //   m.log("Fees", fees);
  //   assert.equal(fees, 2700000000000000000);
  //
  //   // Check active trades
  //   let numPairs = await openLev.numPairs();
  //
  //   let numTrades = 0;
  //   for (let i = 0; i < numPairs; i++) {
  //     let trade = await openLev.getActiveTrade(trader, i, true);
  //     m.log("Margin Trade executed", i, ": ", JSON.stringify(trade, 0, 2));
  //     assert.equal(trade.deposited, 397300000000000000000); // TODO check after fees amount accuracy
  //     assert.equal(trade.held, 821147572990716389330, "");
  //     numTrades++;
  //   }
  //
  //   assert.equal(numTrades, 1, "Should have one trade only");
  //
  //   // Check balances
  //   checkAmount("Trader Balance", 9600000000000000000000, await token0.balanceOf(trader), 18);
  //   checkAmount("Treasury Balance", 1809000000000000000, await token0.balanceOf(treasury.address), 18);
  //   checkAmount("OpenLev Balance", 821147572990716389330, await token1.balanceOf(openLev.address), 18);
  //
  //   // Market price change, then check margin ratio
  //   await priceOracle.setPrice(token1.address, token0.address, 120000000);
  //   let marginRatio_1 = await openLev.marginRatio(trader, 0, 1, {from: saver});
  //   m.log("Margin Ratio:", marginRatio_1.current / 100, "%");
  //   assert.equal(marginRatio_1.current.toString(), 9707);
  //
  //   // Close trade
  //   let tx_close = await openLev.closeTrade(0, 1, "821147572990716389330", 0, {from: trader});
  //
  //   // Check contract held balance
  //   checkAmount("OpenLev Balance", 891000000000000000, await token0.balanceOf(openLev.address), 18);
  //   checkAmount("Trader Balance", 9854632375775357216324, await token0.balanceOf(trader), 18);
  //   checkAmount("Treasury Balance", 1809000000000000000, await token0.balanceOf(treasury.address), 18);
  //   checkAmount("Treasury Balance", 1650506621711339942, await token1.balanceOf(treasury.address), 18);
  //   await printBlockNum();
  // })

  it("Open with Referrer Test ", async () => {
    let pairId = 0;
    let token0 = await MockERC20.at(await openLev.token0(pairId));
    let token1 = await MockERC20.at(await openLev.token1(pairId));
    //set Referral
    let referrer = accounts[8];
    let referral = await utils.createReferral(openLev.address, admin);
    await referral.registerReferrer({from: referrer});
    await openLev.setReferral(referral.address);

    // provide some funds for trader and saver
    await utils.mint(token0, trader, 10000);
    await utils.mint(token0, saver, 10000);

    // Trader to approve openLev to spend
    let deposit = utils.toWei(400);
    await token0.approve(openLev.address, deposit, {from: trader});

    // Saver deposit to pool1
    let saverSupply = utils.toWei(1000);
    let pool0 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool0);
    await token0.approve(await pool0.address, utils.toWei(1000), {from: saver});
    await pool0.mint(saverSupply, {from: saver});

    //Set price
    await priceOracle.setPrice(token1.address, token0.address, 100000000);
    await priceOracle.setPrice(token0.address, token1.address, 100000000);
    let borrow = utils.toWei(500);
    let tx = await openLev.marginTrade(0, true, false, deposit, borrow, 0, referrer, {from: trader});

    // Check events
    let fees = tx.logs[0].args.fees;
    m.log("Fees", fees);
    assert.equal(fees, 2700000000000000000);
    let referralBalance = await token0.balanceOf(referral.address);
    let treasuryBalance = await token0.balanceOf(treasury.address);
    m.log("Referral balance", referralBalance);
    m.log("Treasury balance", treasuryBalance);
    //referralBalance=fees*18%
    assert.equal(referralBalance, 432000000000000000);
    //treasuryBalance=fees-insurance-referralBalance
    assert.equal(treasuryBalance, 1377000000000000000);
  })


  /*** Admin Test ***/

  // it("Admin setDefaultMarginRatio test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setDefaultMarginRatio(uint32)',
  //     web3.eth.abi.encodeParameters(['uint32'], [1]), 0)
  //   assert.equal(1, await openLev.defaultMarginRatio());
  //   try {
  //     await openLev.setDefaultMarginRatio(1);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setMarketMarginLimit test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setMarketMarginLimit(uint16,uint32)',
  //     web3.eth.abi.encodeParameters(['uint16', 'uint32'], [1, 20]), 0)
  //   assert.equal(20, (await openLev.markets(1)).marginRatio);
  //   try {
  //     await openLev.setMarketMarginLimit(1, 20);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setFeesRate test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setFeesRate(uint256)',
  //     web3.eth.abi.encodeParameters(['uint256'], [1]), 0)
  //   assert.equal(1, await openLev.feesRate());
  //   try {
  //     await openLev.setFeesRate(1);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setInsuranceRatio test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setInsuranceRatio(uint8)',
  //     web3.eth.abi.encodeParameters(['uint8'], [1]), 0)
  //   assert.equal(1, await openLev.insuranceRatio());
  //   try {
  //     await openLev.setInsuranceRatio(1);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setPriceOracle test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   let newPriceOracle = await utils.createPriceOracle();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setPriceOracle(address)',
  //     web3.eth.abi.encodeParameters(['address'], [newPriceOracle.address]), 0)
  //   assert.equal(newPriceOracle.address, await openLev.priceOracle());
  //   try {
  //     await openLev.setPriceOracle(newPriceOracle.address);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setUniswapFactory test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   let newUniFactory = await utils.createUniswapFactory();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setUniswapFactory(address)',
  //     web3.eth.abi.encodeParameters(['address'], [newUniFactory.address]), 0)
  //   assert.equal(newUniFactory.address, await openLev.uniswapFactory());
  //   try {
  //     await openLev.setUniswapFactory(newUniFactory.address);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setReferral test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   let newReferral = accounts[1]
  //   await timeLock.executeTransaction(openLev.address, 0, 'setReferral(address)',
  //     web3.eth.abi.encodeParameters(['address'], [newReferral]), 0)
  //   assert.equal(newReferral, await openLev.referral());
  //   try {
  //     await openLev.setReferral(newReferral);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setController test", async () => {
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   let newController = await utils.createController(accounts[0]);
  //   await timeLock.executeTransaction(openLev.address, 0, 'setController(address)',
  //     web3.eth.abi.encodeParameters(['address'], [newController.address]), 0)
  //   assert.equal(newController.address, await openLev.controller());
  //   try {
  //     await openLev.setController(newController.address);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin moveInsurance test", async () => {
  //   let pairId = 0;
  //   await printBlockNum();
  //   let token0 = await MockERC20.at(await openLev.token0(pairId));
  //   let token1 = await MockERC20.at(await openLev.token1(pairId));
  //   await utils.mint(token1, trader, 10000);
  //   checkAmount(await token1.symbol() + " Trader " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(trader), 18);
  //   await utils.mint(token1, saver, 10000);
  //   checkAmount(await token1.symbol() + " Saver " + last8(saver) + " Balance", 10000000000000000000000, await token1.balanceOf(saver), 18);
  //   let deposit = utils.toWei(400);
  //   await token1.approve(openLev.address, deposit, {from: trader});
  //   let saverSupply = utils.toWei(1000);
  //   let pool1 = await LPErc20Delegator.at((await openLev.markets(pairId)).pool1);
  //   await token1.approve(await pool1.address, utils.toWei(1000), {from: saver});
  //   await pool1.mint(saverSupply, {from: saver});
  //   let borrow = utils.toWei(500);
  //   await priceOracle.setPrice(token0.address, token1.address, 100000000);
  //   await priceOracle.setPrice(token1.address, token0.address, 100000000);
  //   await openLev.marginTrade(0, false, true, deposit, borrow, 0, "0x0000000000000000000000000000000000000000", {from: trader});
  //
  //   let timeLock = await utils.createTimelock(admin);
  //   await openLev.setPendingAdmin(timeLock.address);
  //   await openLev.acceptAdmin();
  //
  //   let pool1Insurance = (await openLev.markets(pairId)).pool1Insurance;
  //   m.log("pool1Insurance", pool1Insurance);
  //   await timeLock.executeTransaction(openLev.address, 0, 'moveInsurance(uint16,uint8,address,uint256)',
  //     web3.eth.abi.encodeParameters(['uint16', 'uint8', 'address', 'uint256'], [pairId, 1, accounts[5], pool1Insurance]), 0)
  //
  //   assert.equal("0", (await openLev.markets(pairId)).pool1Insurance);
  //   assert.equal(pool1Insurance, (await token1.balanceOf(accounts[5])).toString());
  //   try {
  //     await openLev.moveInsurance(pairId, 1, accounts[5], pool1Insurance);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // })
  // it("Admin setImplementation test", async () => {
  //   let instance = await OpenLevV1.new();
  //   let {timeLock, openLev} = await instanceSimpleOpenLev();
  //   await timeLock.executeTransaction(openLev.address, 0, 'setImplementation(address)',
  //     web3.eth.abi.encodeParameters(['address'], [instance.address]), 0)
  //   assert.equal(instance.address, await openLev.implementation());
  //   try {
  //     await openLev.setImplementation(instance.address);
  //     assert.fail("should thrown caller must be admin error");
  //   } catch (error) {
  //     assert.include(error.message, 'caller must be admin', 'throws exception with caller must be admin');
  //   }
  // });

  async function instanceSimpleOpenLev() {
    let timeLock = await utils.createTimelock(admin);
    let openLev = await utils.createOpenLev("0x0000000000000000000000000000000000000000",
      timeLock.address, "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000");
    return {
      timeLock: timeLock,
      openLev: openLev
    };
  }
})