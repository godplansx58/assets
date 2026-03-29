// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  AfriChainX (AFRX)
 * @notice Official TRC-20 token on TRON Mainnet
 * @dev    https://sstr.digital/afrx
 *
 * ── Tokenomics (1,000,000,000 AFRX) ─────────────────────────────────────
 *   50% → 500,000,000  Platform wallet (reussite522 / sstr.digital)
 *   20% → 200,000,000  Liquidity reserve (SunSwap pool)
 *   20% → 200,000,000  Community & Airdrops
 *   10% → 100,000,000  Dev fund
 *
 * ── Features ─────────────────────────────────────────────────────────────
 *   Standard TRC-20 transfer / approve / transferFrom
 *   batchTransfer()   — airdrop in one call
 *   mint()            — future rounds (hard cap 2B)
 *   burn()            — deflationary option
 *   feeDiscount       — holders pay 0.2% fee instead of 1% in the app
 *   antiDump          — optional max sell per tx (off by default)
 */
contract AFRX_TRC20 {

    string  public name     = "AfriChainX";
    string  public symbol   = "AFRX";
    uint8   public decimals = 18;

    uint256 public totalSupply;
    uint256 public constant HARD_CAP = 2_000_000_000 * 10**18;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool)                        public feeDiscount;
    mapping(address => bool)                        public hasReceivedAirdrop;

    address public owner;

    bool    public antiDumpEnabled = false;
    uint256 public maxSellPerTx    = 10_000_000 * 10**18;

    event Transfer(address indexed from,  address indexed to,      uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to,        uint256 amount);
    event Burn(address indexed from,      uint256 amount);
    event FeeDiscountSet(address indexed addr, bool enabled);
    event OwnershipTransferred(address indexed prev, address indexed next);

    modifier onlyOwner() {
        require(msg.sender == owner, "AFRX: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        uint256 total = 1_000_000_000 * 10**18;
        totalSupply       = total;
        balanceOf[owner]  = total;
        feeDiscount[owner] = true;
        emit Transfer(address(0), owner, total);
    }

    // ── Core TRC-20 ──────────────────────────────────────────────────────
    function transfer(address to, uint256 value) public returns (bool) {
        require(to != address(0), "AFRX: zero address");
        if (antiDumpEnabled && msg.sender != owner)
            require(value <= maxSellPerTx, "AFRX: exceeds max sell per tx");
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        require(spender != address(0), "AFRX: zero address");
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(to != address(0), "AFRX: zero address");
        require(allowance[from][msg.sender] >= value, "AFRX: allowance exceeded");
        if (antiDumpEnabled && from != owner)
            require(value <= maxSellPerTx, "AFRX: exceeds max sell per tx");
        allowance[from][msg.sender] -= value;
        _move(from, to, value);
        return true;
    }

    // ── Airdrop ──────────────────────────────────────────────────────────
    function batchTransfer(address[] calldata recipients, uint256 amountEach) external onlyOwner {
        uint256 total = amountEach * recipients.length;
        require(balanceOf[msg.sender] >= total, "AFRX: insufficient balance");
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] != address(0)) {
                _move(msg.sender, recipients[i], amountEach);
                hasReceivedAirdrop[recipients[i]] = true;
            }
        }
    }

    // ── Mint (future rounds, hard cap 2B) ────────────────────────────────
    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "AFRX: zero address");
        require(totalSupply + amount <= HARD_CAP, "AFRX: hard cap reached");
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit Mint(to, amount);
    }

    // ── Burn (deflationary) ──────────────────────────────────────────────
    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "AFRX: insufficient");
        balanceOf[msg.sender] -= amount;
        totalSupply           -= amount;
        emit Transfer(msg.sender, address(0), amount);
        emit Burn(msg.sender, amount);
    }

    // ── Admin ────────────────────────────────────────────────────────────
    function setFeeDiscount(address addr, bool enabled) external onlyOwner {
        feeDiscount[addr] = enabled;
        emit FeeDiscountSet(addr, enabled);
    }

    function setAntiDump(bool enabled, uint256 maxPerTx) external onlyOwner {
        antiDumpEnabled = enabled;
        maxSellPerTx    = maxPerTx;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AFRX: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ── Internal ─────────────────────────────────────────────────────────
    function _move(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "AFRX: insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to]   += value;
        emit Transfer(from, to, value);
    }
}
