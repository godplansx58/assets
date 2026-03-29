// USDT Transaction Simulator Engine
const Simulator = {
  
  // Generate a realistic Ethereum transaction hash
  generateTxHash: function() {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  },

  // Generate a realistic Ethereum block number
  generateBlockNumber: function() {
    const base = 19500000;
    return base + Math.floor(Math.random() * 500000);
  },

  // Generate a realistic gas used value
  generateGasUsed: function() {
    return (Math.floor(Math.random() * 10000) + 55000).toString();
  },

  // Generate a realistic nonce
  generateNonce: function() {
    return Math.floor(Math.random() * 1000);
  },

  // Format USDT amount with proper decimals
  formatAmount: function(amount) {
    const num = parseFloat(amount);
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  },

  // Validate Ethereum address
  isValidAddress: function(address) {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
  },

  // Shorten address for display
  shortenAddress: function(address) {
    if (!address) return '';
    return address.substring(0, 6) + '...' + address.substring(address.length - 4);
  },

  // Simulate transaction with progressive confirmations
  simulateTransaction: function(txData, onProgress, onComplete) {
    const txHash = this.generateTxHash();
    const blockNumber = this.generateBlockNumber();
    const gasUsed = this.generateGasUsed();
    const nonce = this.generateNonce();
    const timestamp = new Date().toISOString();

    const txResult = {
      hash: txHash,
      from: txData.from,
      to: txData.to,
      amount: txData.amount,
      blockNumber: blockNumber,
      gasUsed: gasUsed,
      nonce: nonce,
      timestamp: timestamp,
      status: 'pending',
      confirmations: 0
    };

    // Phase 1: Broadcasting (1.5s)
    setTimeout(() => {
      onProgress({ phase: 'broadcasting', tx: txResult, confirmations: 0 });
    }, 500);

    // Phase 2: Pending in mempool (2s)
    setTimeout(() => {
      onProgress({ phase: 'pending', tx: txResult, confirmations: 0 });
    }, 2000);

    // Phase 3: First confirmation (3s)
    setTimeout(() => {
      txResult.confirmations = 1;
      txResult.status = 'confirming';
      onProgress({ phase: 'confirming', tx: txResult, confirmations: 1 });
    }, 3500);

    // Phase 4: Progressive confirmations (3-12)
    let conf = 2;
    const confirmInterval = setInterval(() => {
      if (conf <= CONFIG.CONFIRMATIONS_REQUIRED) {
        txResult.confirmations = conf;
        onProgress({ phase: 'confirming', tx: txResult, confirmations: conf });
        conf++;
      } else {
        clearInterval(confirmInterval);
        txResult.status = 'confirmed';
        txResult.confirmations = CONFIG.CONFIRMATIONS_REQUIRED;
        onComplete({ phase: 'confirmed', tx: txResult, confirmations: CONFIG.CONFIRMATIONS_REQUIRED });
      }
    }, 800);

    return txHash;
  },

  // ===== PER-ADDRESS BALANCE MANAGEMENT =====

  // Get balance for a specific address
  getAddressBalance: function(address) {
    if (!address) return parseFloat(CONFIG.DEFAULT_BALANCE);
    const key = 'usdt_balance_' + address.toLowerCase();
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      return parseFloat(stored);
    }
    // First time: assign default balance
    const defaultBal = parseFloat(CONFIG.DEFAULT_BALANCE);
    localStorage.setItem(key, defaultBal.toString());
    return defaultBal;
  },

  // Set balance for a specific address
  setAddressBalance: function(address, balance) {
    if (!address) return;
    const key = 'usdt_balance_' + address.toLowerCase();
    const bal = Math.max(0, parseFloat(balance));
    localStorage.setItem(key, bal.toFixed(6));
    return bal;
  },

  // Deduct sent amount from sender balance
  deductSentBalance: function(address, amount) {
    const current = this.getAddressBalance(address);
    const newBal = Math.max(0, current - parseFloat(amount));
    this.setAddressBalance(address, newBal);
    return newBal;
  },

  // Add received amount to recipient balance
  addReceivedBalance: function(address, amount) {
    const current = this.getAddressBalance(address);
    const newBal = current + parseFloat(amount);
    this.setAddressBalance(address, newBal);
    return newBal;
  },

  // Save transaction to local storage
  saveTransaction: function(tx) {
    let history = this.getTransactionHistory();
    history.unshift(tx);
    // Keep only last 50 transactions
    if (history.length > 50) history = history.slice(0, 50);
    localStorage.setItem('usdt_tx_history', JSON.stringify(history));
  },

  // Get transaction history from local storage
  getTransactionHistory: function() {
    try {
      const data = localStorage.getItem('usdt_tx_history');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  // Clear transaction history
  clearHistory: function() {
    localStorage.removeItem('usdt_tx_history');
  },

  // Format date for display
  formatDate: function(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  // Calculate USD value (USDT = 1:1 USD)
  formatUSD: function(amount) {
    const num = parseFloat(amount);
    return '$' + num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
};
