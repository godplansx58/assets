// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CustomUSDT_TRC20_Mini
 * @dev Minimal TRC-20 custom token for TRON Mainnet.
 *      Stripped of approve/transferFrom/allowance to minimize bytecode.
 *      Keeps: balanceOf, transfer, claimFaucet, hasClaimed, mint, owner.
 *      Deploy cost: ~150k-200k energy (~30-40 TRX)
 */
contract CustomUSDT_TRC20_Mini {
    string  public name     = "Tether USD";
    string  public symbol   = "USDT";
    uint8   public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => bool)    public hasClaimed;

    address public owner;

    // 500,000,000 USDT with 6 decimals
    uint256 private constant FAUCET = 500000000000000;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor() {
        owner = msg.sender;
        uint256 init = 1000000000000 * 1e6;
        totalSupply = init;
        balanceOf[msg.sender] = init;
        emit Transfer(address(0), msg.sender, init);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(to != address(0), "0x0");
        require(balanceOf[msg.sender] >= value, "bal");
        balanceOf[msg.sender] -= value;
        balanceOf[to]         += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function claimFaucet() external {
        require(!hasClaimed[msg.sender], "claimed");
        hasClaimed[msg.sender] = true;
        totalSupply           += FAUCET;
        balanceOf[msg.sender] += FAUCET;
        emit Transfer(address(0), msg.sender, FAUCET);
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "owner");
        require(to != address(0), "0x0");
        totalSupply   += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
