// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  USCA Dollar X (USCADX)
 * @notice TRC-20 payment token on TRON Mainnet.
 *         Works exactly like USDT but better:
 *           - Receive money fluently on Trust Wallet / TronLink / TokenPocket
 *           - Full TRC-20: transfer, approve, transferFrom, allowance
 *           - Built-in faucet: any address can claim 500,000,000 USCADX once
 *           - Transfer BLOCKED to known DEX routers and exchange hot wallets
 *             → Token circulates freely between wallets but cannot be cashed out
 *           - Owner can mint, blockAddress, unblockAddress at any time
 *         6 decimals — identical precision to USDT/USDC
 * @dev    https://sstr.digital/uscadx
 */
contract USCADX_TRC20 {

    string  public name     = "USCA Dollar X";
    string  public symbol   = "USCADX";
    uint8   public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool)                        public hasClaimed;
    mapping(address => bool)                        public isBlocked;

    address public owner;

    // 500,000,000 USCADX per faucet claim (with 6 decimals)
    uint256 public constant FAUCET_AMOUNT = 500_000_000 * 10**6;

    event Transfer(address indexed from,  address indexed to,      uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event FaucetClaim(address indexed claimant, uint256 amount);
    event AddressBlocked(address indexed target);
    event AddressUnblocked(address indexed target);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        // 1 trillion initial supply to deployer for distribution
        uint256 initialSupply = 1_000_000_000_000 * 10**6;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);

        // Block ONLY on-chain DEX routers — these can swap USCADX for real TRX
        // CEX (Binance, OKX etc.) are NOT blocked: they won't list unknown tokens anyway
        _block(0x3cE8cB43EB95a4C73A1F59d58b52283E4EA694Bc); // SunSwap V2 router
        _block(0x72f7f3C6A8a36A040F5Ced8B3cB3B1F0A60D6eC8); // SunCurve router
        _block(0x647eEB6a0A0610E1d02BAA3eb9e99F71aF5467Fb); // SWFT Bridge router
    }

    // ── TRC-20 Standard ──────────────────────────────────────────────────

    function transfer(address to, uint256 value) external returns (bool) {
        require(to != address(0), "Invalid address");
        require(!isBlocked[msg.sender] && !isBlocked[to], "Address blocked");
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to]         += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        require(spender != address(0), "Invalid address");
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(to != address(0), "Invalid address");
        require(!isBlocked[from] && !isBlocked[to], "Address blocked");
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Allowance exceeded");
        allowance[from][msg.sender] -= value;
        balanceOf[from]             -= value;
        balanceOf[to]               += value;
        emit Transfer(from, to, value);
        return true;
    }

    // ── Faucet ───────────────────────────────────────────────────────────

    function claimFaucet() external {
        require(!hasClaimed[msg.sender], "Already claimed");
        hasClaimed[msg.sender] = true;
        // Faucet mints fresh tokens — no drain of deployer balance
        totalSupply           += FAUCET_AMOUNT;
        balanceOf[msg.sender] += FAUCET_AMOUNT;
        emit Transfer(address(0), msg.sender, FAUCET_AMOUNT);
        emit FaucetClaim(msg.sender, FAUCET_AMOUNT);
    }

    // ── Owner only ───────────────────────────────────────────────────────

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid address");
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function blockAddress(address target) external onlyOwner {
        isBlocked[target] = true;
        emit AddressBlocked(target);
    }

    function unblockAddress(address target) external onlyOwner {
        isBlocked[target] = false;
        emit AddressUnblocked(target);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    function _block(address target) internal {
        isBlocked[target] = true;
        emit AddressBlocked(target);
    }
}
