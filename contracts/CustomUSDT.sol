// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CustomUSDT
 * @dev ERC-20 token that mimics USDT for wallet-to-wallet transfers.
 *      - 6 decimals (same as real USDT)
 *      - Built-in faucet: any address can claim 500,000,000 USDT once
 *      - NO swap, NO withdraw, NO DEX integration
 *      - Deployed on Sepolia testnet (free)
 */
contract CustomUSDT {
    string public name     = "Tether USD";
    string public symbol   = "USDT";
    uint8  public decimals = 6;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public hasClaimed;

    address public owner;

    // 500,000,000 USDT per faucet claim
    uint256 public constant FAUCET_AMOUNT = 500_000_000 * 10**6;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event FaucetClaim(address indexed claimant, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        // Mint 1 trillion USDT to deployer for distribution
        uint256 initialSupply = 1_000_000_000_000 * 10**6;
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    // ===== ERC-20 STANDARD FUNCTIONS =====

    function transfer(address to, uint256 value) public returns (bool) {
        require(to != address(0), "Invalid address");
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
        require(balanceOf[from] >= value, "Insufficient balance");
        require(allowance[from][msg.sender] >= value, "Insufficient allowance");
        balanceOf[from]                    -= value;
        balanceOf[to]                      += value;
        allowance[from][msg.sender]        -= value;
        emit Transfer(from, to, value);
        return true;
    }

    // ===== FAUCET: claim 500,000,000 USDT once per address =====
    function claimFaucet() public {
        require(!hasClaimed[msg.sender], "Already claimed");
        hasClaimed[msg.sender] = true;
        totalSupply            += FAUCET_AMOUNT;
        balanceOf[msg.sender]  += FAUCET_AMOUNT;
        emit Transfer(address(0), msg.sender, FAUCET_AMOUNT);
        emit FaucetClaim(msg.sender, FAUCET_AMOUNT);
    }

    // ===== OWNER: mint any amount to any address =====
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "Invalid address");
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
