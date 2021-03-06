const Reserve = artifacts.require("Reserve");
const OLEToken = artifacts.require("OLEToken");
const {assertPrint} = require("./utils/OpenLevUtil");
const timeMachine = require('ganache-time-traveler');

const m = require('mocha-logger');

contract("Reserve", async accounts => {

  // roles
  let admin = accounts[0];
  let governance = accounts[1];
  let user = accounts[2];

  it("Vesting test", async () => {

    let oleToken = await OLEToken.new(admin, "Open Leverage Token", "OLE");
    await oleToken.mint(admin, '1000000000000000000');

    let latestBlock = await web3.eth.getBlock("latest");
    let currentBlockTime = latestBlock.timestamp;
    let nextDay = currentBlockTime + 86400;
    let fiveYearsLater = nextDay + 157766400;
    m.log("Current block timestamp:", currentBlockTime, new Date(currentBlockTime * 1000));

    let reserve = await Reserve.new(admin, oleToken.address, '1000000000000000000', nextDay, fiveYearsLater);
    oleToken.transfer(reserve.address, '1000000000000000000', {from: admin});

    assertPrint("Available To Vest", 0, await reserve.availableToVest());

    await timeMachine.advanceTimeAndBlock(172800); // 2 days
    m.log("Advancing time to 2 days later:", (await web3.eth.getBlock("latest")).timestamp);

    let avail = await reserve.availableToVest();
    m.log("Avail to vest:", avail);
    assertPrint("Available To Vest Check", avail > 547640000000000, true);
    assertPrint("Available To Vest Check", avail < 547660000000000, true);

    await reserve.transfer(user, avail, {from: admin});
    assertPrint("Transferred Out", avail, await oleToken.balanceOf(user));
    assertPrint("Available To Vest", 0, await reserve.availableToVest());

    await timeMachine.advanceTimeAndBlock(86400); // 1 days
    m.log("Advancing time to 1 day again:", (await web3.eth.getBlock("latest")).timestamp);

    avail = await reserve.availableToVest();
    m.log("Avail to vest:", avail);
    assertPrint("Available To Vest Check", avail > 547640000000000, true);
    assertPrint("Available To Vest Check", avail < 547660000000000, true);

    await timeMachine.advanceTimeAndBlock(86400); // 1 days
    m.log("Advancing time to 1 day again:", (await web3.eth.getBlock("latest")).timestamp);

    avail = await reserve.availableToVest();
    m.log("Avail to vest:", avail);
    assertPrint("Available To Vest Check", avail > 1095190251916757, true);
    assertPrint("Available To Vest Check", avail < 1095390251916757, true);

    await timeMachine.advanceTimeAndBlock(157766400); // 5 yrs
    m.log("Advancing time to 5 yrs later:", (await web3.eth.getBlock("latest")).timestamp);

    avail = await reserve.availableToVest();
    m.log("Avail to vest:", avail);
    assertPrint("Available To Vest Check", avail, '999452354874041622');

    await reserve.transfer(user, avail, {from: admin});
    assertPrint("Transferred Out", '1000000000000000000', await oleToken.balanceOf(user));
    assertPrint("Available To Vest", 0, await reserve.availableToVest());

  })

})
