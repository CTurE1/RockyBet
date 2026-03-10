// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Market} from "./Market.sol";

/// @title MarketFactory — Creates and tracks prediction markets
/// @dev Audit fixes: zero-address check on setAdmin, empty question validation
contract MarketFactory {
    address public admin;
    Market[] public markets;

    uint256 public constant COOLDOWN = 1 hours;
    mapping(address => uint256) public lastCreated;

    event MarketCreated(uint256 indexed marketId, address marketAddress, string question, uint256 deadline);

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Create a new prediction market (1 hour cooldown per wallet, admin exempt)
    function createMarket(string calldata _question, uint256 _deadline) external returns (uint256) {
        require(bytes(_question).length > 0, "EMPTY_QUESTION");
        require(_deadline > block.timestamp, "DEADLINE_IN_PAST");
        if (msg.sender != admin) {
            require(block.timestamp >= lastCreated[msg.sender] + COOLDOWN, "COOLDOWN_ACTIVE");
        }
        lastCreated[msg.sender] = block.timestamp;

        Market market = new Market(admin, _question, _deadline);
        uint256 marketId = markets.length;
        markets.push(market);

        emit MarketCreated(marketId, address(market), _question, _deadline);
        return marketId;
    }

    /// @notice Get total number of markets
    function getMarketCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice Get market address by ID
    function getMarket(uint256 _id) external view returns (address) {
        require(_id < markets.length, "INVALID_ID");
        return address(markets[_id]);
    }

    /// @notice Get all market addresses
    function getAllMarkets() external view returns (address[] memory) {
        address[] memory addrs = new address[](markets.length);
        for (uint256 i = 0; i < markets.length; i++) {
            addrs[i] = address(markets[i]);
        }
        return addrs;
    }

    /// @notice Transfer admin role
    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "ZERO_ADDRESS");
        admin = _newAdmin;
    }
}
