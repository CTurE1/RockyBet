// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// @title Market — Single prediction market with shielded bets
/// @notice Bets are encrypted on-chain using Seismic shielded types (suint256).
///         Pool totals per side are also shielded until resolution.
/// @dev Audit fixes applied:
///      - Pull pattern for fees (no external call during placeBet → CEI compliant)
///      - Manual ReentrancyGuard on all functions with external calls
///      - Safety cap in claim subtracts uncollected fees from available balance
///      - Removed receive() to prevent accidental ETH deposits inflating balance
contract Market {
    address public factory;
    address public admin;
    string public question;
    uint256 public deadline;
    bool public resolved;
    bool public outcome; // true = YES wins, false = NO wins

    uint256 public totalPool;
    uint256 public totalBettors;

    uint256 public constant FEE_BPS = 200; // 2% fee
    uint256 public constant BPS = 10000;

    // ── Fee accumulator (pull pattern — no external call during bet) ──
    uint256 public accumulatedFees;

    // ── Reentrancy guard ──────────────────────────────────────────────
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANT");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ── Shielded storage ────────────────────────────────────────────────
    // Individual bets — only the bettor can read via signedRead
    mapping(address => suint256) private yesBets;
    mapping(address => suint256) private noBets;

    // Aggregate pool per side — shielded during betting, revealed at resolution
    suint256 private sTotalYes;
    suint256 private sTotalNo;

    // ── Public bookkeeping ──────────────────────────────────────────────
    mapping(address => bool) public hasBet;
    mapping(address => bool) public claimed;

    // Revealed only after resolution
    uint256 public revealedYesPool;
    uint256 public revealedNoPool;

    event BetPlaced(address indexed bettor, uint256 indexed marketId);
    event MarketResolved(bool outcome, uint256 yesPool, uint256 noPool);
    event Claimed(address indexed bettor, uint256 payout);
    event FeesWithdrawn(address indexed admin, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
    }

    modifier beforeDeadline() {
        require(block.timestamp < deadline, "DEADLINE_PASSED");
        _;
    }

    modifier afterResolution() {
        require(resolved, "NOT_RESOLVED");
        _;
    }

    constructor(
        address _admin,
        string memory _question,
        uint256 _deadline
    ) {
        factory = msg.sender;
        admin = _admin;
        question = _question;
        deadline = _deadline;
    }

    /// @notice Place a shielded bet. _side: 1 = YES, 0 = NO (encrypted suint256)
    /// @dev Uses branchless shielded arithmetic — no if/else, no information leak.
    ///      _side is encrypted (suint256) so on-chain validation of 0/1 bounds is
    ///      impossible without revealing the value — this is a fundamental Seismic
    ///      design tradeoff. The frontend enforces valid input via seismic-viem.
    ///      Fee uses pull pattern: accumulated in contract, admin withdraws separately.
    ///      No external calls in this function → fully CEI compliant.
    function placeBet(suint256 _side) external payable beforeDeadline nonReentrant {
        require(!resolved, "MARKET_RESOLVED");
        require(msg.value > 0, "NO_VALUE");

        // Fee calculation (plaintext — msg.value is public)
        uint256 fee = (msg.value * FEE_BPS) / BPS;
        uint256 betAmount = msg.value - fee;

        // Pull pattern: accumulate fees, admin withdraws via withdrawFees()
        accumulatedFees += fee;

        // ── Shielded domain arithmetic ────────────────────────────────
        suint256 sAmount = suint256(betAmount);
        suint256 sOne = suint256(1);

        // Branchless distribution:
        //   _side = 1  →  yesAdd = sAmount, noAdd = 0
        //   _side = 0  →  yesAdd = 0,       noAdd = sAmount
        suint256 yesAdd = _side * sAmount;
        suint256 noAdd = (sOne - _side) * sAmount;

        // Update individual shielded balances
        yesBets[msg.sender] = yesBets[msg.sender] + yesAdd;
        noBets[msg.sender] = noBets[msg.sender] + noAdd;

        // Update shielded pool totals (hidden until resolve)
        sTotalYes = sTotalYes + yesAdd;
        sTotalNo = sTotalNo + noAdd;

        // ── Public counters (aggregate only — no side info leaked) ────
        totalPool += betAmount;
        if (!hasBet[msg.sender]) {
            hasBet[msg.sender] = true;
            totalBettors++;
        }

        emit BetPlaced(msg.sender, 0);
    }

    /// @notice Admin resolves the market after the deadline
    /// @dev Reveals shielded pool totals — safe because betting is closed
    /// @dev Admin can resolve early if the event outcome is already known.
    ///      Once resolved, placeBet rejects new bets (require(!resolved)).
    function resolve(bool _outcome) external onlyAdmin {
        require(!resolved, "ALREADY_RESOLVED");

        resolved = true;
        outcome = _outcome;

        // Reveal per-side pools (suint256 → uint256 cast)
        revealedYesPool = uint256(sTotalYes);
        revealedNoPool = uint256(sTotalNo);

        emit MarketResolved(_outcome, revealedYesPool, revealedNoPool);
    }

    /// @notice Claim winnings after resolution
    /// @dev payout = (userBet / winningPool) * totalPool
    ///      Winners split the ENTIRE pool proportionally to their bet size.
    ///      CEI pattern: claimed flag set before external transfer.
    function claim() external afterResolution nonReentrant {
        require(hasBet[msg.sender], "NO_BET");
        require(!claimed[msg.sender], "ALREADY_CLAIMED");

        // EFFECTS: mark claimed before external call
        claimed[msg.sender] = true;

        // Reveal this user's bet on the winning side
        uint256 userBet;
        if (outcome) {
            userBet = uint256(yesBets[msg.sender]);
        } else {
            userBet = uint256(noBets[msg.sender]);
        }
        require(userBet > 0, "WRONG_SIDE");

        uint256 winningPool = outcome ? revealedYesPool : revealedNoPool;
        require(winningPool > 0, "NO_WINNING_BETS");

        // Proportional payout from the entire pool
        uint256 payout = (userBet * totalPool) / winningPool;

        // Safety cap: exclude uncollected fees from available balance
        uint256 available = address(this).balance - accumulatedFees;
        if (payout > available) {
            payout = available;
        }

        // INTERACTIONS: external call last
        payable(msg.sender).transfer(payout);

        emit Claimed(msg.sender, payout);
    }

    /// @notice Admin withdraws accumulated protocol fees (pull pattern)
    /// @dev Safe to call at any time — fees are separate from the betting pool
    function withdrawFees() external onlyAdmin nonReentrant {
        uint256 amount = accumulatedFees;
        require(amount > 0, "NO_FEES");

        // EFFECTS
        accumulatedFees = 0;

        // INTERACTIONS
        payable(admin).transfer(amount);

        emit FeesWithdrawn(admin, amount);
    }

    /// @notice View your own shielded bet (requires signedRead — msg.sender verified)
    function getMyBet() external view returns (uint256 yesBet, uint256 noBet) {
        yesBet = uint256(yesBets[msg.sender]);
        noBet = uint256(noBets[msg.sender]);
    }

    /// @notice Get public market info
    function getInfo() external view returns (
        string memory _question,
        uint256 _deadline,
        bool _resolved,
        bool _outcome,
        uint256 _totalPool,
        uint256 _totalBettors
    ) {
        return (question, deadline, resolved, outcome, totalPool, totalBettors);
    }

    // No receive() — contract only accepts ETH via placeBet to prevent balance inflation
}
