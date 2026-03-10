// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";

contract DeployScript is Script {
    MarketFactory public factory;

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVKEY");
        vm.startBroadcast(deployerPrivateKey);

        factory = new MarketFactory();
        console.log("MarketFactory deployed to:", address(factory));

        vm.stopBroadcast();
    }
}
