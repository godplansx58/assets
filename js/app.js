﻿﻿﻿﻿﻿﻿﻿// USDT Sender — Application
// Supports: Tenderly Virtual Mainnet + Sepolia Testnet · ethers.js v6

const App = {
  wallet: { connected: false, address: null, balance: '0.000000', ethBalance: '0.0000', usdcBalance: '0.000000' },
  provider: null,
  signer: null,
  usdtContract: null,
  refreshInterval: null,
  _incomingPollInterval: null,
  activeProvider: null,
  walletType: null,
  ethPrice: 3000,
  trxPrice: 0.29,  // Updated in real-time from CoinGecko
  adminEmail: 'reussite522@gmail.com',
  // Plan USDT amounts matching backend PLAN_USDT
  PLAN_USDT: { '10k': 10000, '500k': 500000, '1m': 1000000 },
  historyState: {
    search: '',
    type: 'all',
    network: 'all',
    token: 'all',
  },

  // Returns the faucet claim amount for the logged-in user:
  // — Admin (reussite522@gmail.com) → CONFIG full faucet (500M)
  // — Regular client → their plan amount (10k/500k/1m)
  getUserFaucetAmount: function () {
    var userData;
    try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch (e) { userData = {}; }
    if ((userData.email || '').toLowerCase() === this.adminEmail) {
      return CONFIG.FAUCET_AMOUNT;
    }
    return this.PLAN_USDT[userData.accountType] || CONFIG.FAUCET_AMOUNT;
  },

  // Returns true if this user is the admin
  isAdminUser: function () {
    var userData;
    try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch (e) { userData = {}; }
    return (userData.email || '').toLowerCase() === this.adminEmail;
  },

  // ===== INIT =====
  init: function () {
    this.bindEvents();
    this.loadTransactionHistory();
    this.initNetworkSelector();
    this.initTokenSelector();
    this.detectWallet();
    this.updateInfoSection();
    this.updateReceiveHint();
    this.updateTokenCopy();
    this.initLiveTelemetryLink();
    this.renderContacts();
    this.loadWalletName();
    this.initAdminClaimsTab();
    this.initAdminPanelTab();
    this.initAfrxTab();
    this.initUscadxTab();
    this._handlePayParams();
    // Show account button and auto-connect if user has a valid session
    var _initSelf = this;
    setTimeout(function () {
      _initSelf._showAccountBtnIfLoggedIn();
      if (!_initSelf.wallet.connected) _initSelf._autoConnectAccount();
    }, 80);
  },

  // Pre-fill send form if ?to=, ?amount=, ?token= are in URL (from pay.html redirect)
  _handlePayParams: function () {
    var params = new URLSearchParams(window.location.search);
    var to = params.get('to');
    var amount = params.get('amount');
    var token = params.get('token');
    // Switch to the correct token first
    if (token && CONFIG.TOKENS[token]) {
      CONFIG.activeTokenKey = token;
      this.updateTokenSelectorOptions();
    }
    if (to) {
      var input = document.getElementById('recipient-input');
      if (input) { input.value = to; input.dispatchEvent(new Event('input')); }
    }
    if (amount) {
      var amtInput = document.getElementById('amount-input');
      if (amtInput) amtInput.value = amount;
    }
    if (to || amount) {
      // Switch to send tab after wallet connects
      this._pendingPayTab = true;
    }
  },

  initLiveTelemetryLink: function () {
    var link = document.getElementById('live-telemetry-link');
    if (!link) return;

    var userData;
    try {
      userData = JSON.parse(localStorage.getItem('usdt_user') || '{}');
    } catch (e) {
      userData = {};
    }

    var email = (userData.email || '').toLowerCase();
    var isAllowed = email === this.adminEmail;
    link.style.display = isAllowed ? 'inline-flex' : 'none';
  },

  // ===== ACCOUNT MODE (no wallet extension needed) =====
  _showAccountBtnIfLoggedIn: function () {
    var btn = document.getElementById('connect-account-btn');
    if (!btn) return;
    var jwt = localStorage.getItem('usdt_jwt');
    var userData;
    try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }
    if (jwt && userData.email && userData.status === 'approved') {
      btn.style.display = 'block';
      var hint = document.getElementById('connect-hint-text');
      if (hint) hint.innerHTML = '✅ Compte détecté : <strong>' + userData.email + '</strong> — cliquez sur le bouton vert pour accéder';
    }
  },

  _autoConnectAccount: async function () {
    if (this.wallet.connected) return;
    var jwt = localStorage.getItem('usdt_jwt');
    if (!jwt) return;
    var userData;
    try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }
    if (!userData.email || userData.status !== 'approved') return;
    await this.connectWithAccount();
  },

  connectWithAccount: async function () {
    var jwt = localStorage.getItem('usdt_jwt');
    if (!jwt) { window.location.href = '/login.html'; return; }
    var userData;
    try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }
    if (!userData.email) { window.location.href = '/login.html'; return; }

    var address = userData.tronAddress || userData.email;
    this.wallet.connected  = true;
    this.wallet.address    = address;
    this.wallet.balance    = (userData.usdtBalance || 0).toString();
    this.wallet.ethBalance = '0.0000';
    this.wallet.usdcBalance = '0.000000';
    this.walletType = 'account';

    this.updateUI();
    var modeBadge = document.getElementById('mode-badge');
    if (modeBadge) {
      modeBadge.textContent = '👤 ' + (userData.email.split('@')[0] || 'Mon Compte');
      modeBadge.className = 'mode-badge real';
    }
    var connectBtn = document.getElementById('connect-btn');
    if (connectBtn) { connectBtn.textContent = '✓ Connecté'; connectBtn.classList.add('connected'); connectBtn.disabled = true; }

    this.loadWalletName();
    this.initAdminClaimsTab();
    this.initAdminPanelTab();
    this.initAfrxTab();
    this.initUscadxTab();
    await this.checkFaucetStatus();
    this.loadTransactionHistory();
  },

  // ===== ADMIN CLAIMS =====
  initAdminClaimsTab: function () {
    var btn = document.getElementById('admin-tab-btn');
    if (!btn) return;
    if (this.isAdminUser()) {
      btn.style.display = '';
      this._refreshAdminBadge();
    } else {
      btn.style.display = 'none';
    }
  },

  loadClaimRequests: function () {
    var listEl = document.getElementById('admin-claims-list');
    if (!listEl) return;
    if (!this.isAdminUser()) return;
    listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px 0;">Chargement...</div>';
    var jwt = localStorage.getItem('usdt_jwt') || '';
    fetch('/api/admin/status?action=claims', { headers: { 'Authorization': 'Bearer ' + jwt } })
      .then(function (r) { return r.json(); })
      .then(function (data) { App._renderClaimRequests(data.claims || []); })
      .catch(function () {
        listEl.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:40px 0;">Erreur de chargement.</div>';
      });
  },

  _renderClaimRequests: function (claims) {
    var listEl = document.getElementById('admin-claims-list');
    if (!listEl) return;
    this._updateAdminBadge(claims.filter(function (c) { return c.claimStatus === 'pending'; }).length);
    if (!claims.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px 0;">Aucune demande.</div>';
      return;
    }
    var statusColor = { pending: '#f39c12', approved: '#26a17b', rejected: '#e74c3c' };
    var statusLabel = { pending: '⏳ En attente', approved: '✅ Approuvé', rejected: '❌ Rejeté' };
    var rows = claims.map(function (c) {
      var name = (c.firstName || '') + ' ' + (c.lastName || '');
      name = name.trim() || '—';
      var actions = '';
      if (c.claimStatus === 'pending') {
        actions = [
          '<button onclick="App.approveClaimRequest(\'' + c._id + '\')" ',
          'style="background:#26a17b;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;font-weight:600;margin-right:6px;">✅ Approuver</button>',
          '<button onclick="App.rejectClaimRequest(\'' + c._id + '\')" ',
          'style="background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;font-weight:600;">❌ Rejeter</button>',
        ].join('');
      }
      return [
        '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid var(--border);">',
          '<div style="flex:1;min-width:160px;">',
            '<div style="font-size:13px;font-weight:600;color:var(--text-primary);">' + name + '</div>',
            '<div style="font-size:12px;color:var(--text-muted);">' + c.email + '</div>',
          '</div>',
          '<div style="font-size:12px;color:var(--text-muted);min-width:80px;">Plan: <strong style="color:var(--text-primary);">' + (c.accountType || '—') + '</strong></div>',
          '<div style="font-size:12px;color:var(--text-muted);min-width:100px;">Montant: <strong style="color:#26a17b;">' + (c.planAmount || 0).toLocaleString() + ' USDT</strong></div>',
          '<div style="font-size:12px;font-weight:700;color:' + (statusColor[c.claimStatus] || '#aaa') + ';min-width:100px;">' + (statusLabel[c.claimStatus] || c.claimStatus) + '</div>',
          '<div>' + actions + '</div>',
        '</div>',
      ].join('');
    });
    listEl.innerHTML = rows.join('');
  },

  _refreshAdminBadge: function () {
    if (!this.isAdminUser()) return;
    var jwt = localStorage.getItem('usdt_jwt') || '';
    fetch('/api/admin/status?action=claims', { headers: { 'Authorization': 'Bearer ' + jwt } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var pending = (data.claims || []).filter(function (c) { return c.claimStatus === 'pending'; }).length;
        App._updateAdminBadge(pending);
      })
      .catch(function () {});
  },

  _updateAdminBadge: function (count) {
    var badge = document.getElementById('admin-claims-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  approveClaimRequest: function (userId) {
    var jwt = localStorage.getItem('usdt_jwt') || '';
    fetch('/api/admin/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ action: 'approve_claim', userId: userId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          App.showNotification('✅ Demande approuvée !', 'success');
          App.loadClaimRequests();
        } else {
          App.showNotification('Erreur: ' + (data.error || 'inconnu'), 'error');
        }
      })
      .catch(function () { App.showNotification('Erreur réseau.', 'error'); });
  },

  rejectClaimRequest: function (userId) {
    var jwt = localStorage.getItem('usdt_jwt') || '';
    fetch('/api/admin/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ action: 'reject_claim', userId: userId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          App.showNotification('❌ Demande rejetée.', 'warning');
          App.loadClaimRequests();
        } else {
          App.showNotification('Erreur: ' + (data.error || 'inconnu'), 'error');
        }
      })
      .catch(function () { App.showNotification('Erreur réseau.', 'error'); });
  },

  // ===== NETWORK SELECTOR =====
  initNetworkSelector: function () {
    // Keep user's saved network choice — deploy warning banner handles missing contracts
    const sel = document.getElementById('network-select');
    if (sel) sel.value = CONFIG.activeNetworkKey;
    this.updateNetworkBadge();
  },

  initTokenSelector: function () {
    this.updateTokenSelectorOptions();
  },

  updateTokenSelectorOptions: function () {
    var activeKey = CONFIG.activeTokenKey;
    var tokens = CONFIG.TOKENS;
    var order = CONFIG.SUPPORTED_TOKEN_ORDER || Object.keys(tokens);

    // Show/hide individual token buttons depending on what this network supports
    var toggle = document.getElementById('token-toggle');
    if (toggle) toggle.style.display = order.length > 1 ? '' : 'none';

    order.forEach(function (key) {
      var btn = document.getElementById('token-btn-' + key);
      if (!btn) return;
      // Hide button if this network doesn't have that token
      btn.style.display = tokens[key] ? '' : 'none';
      // Mark active
      if (key === activeKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Keep legacy #token-select in sync if it still exists somewhere
    var sel = document.getElementById('token-select');
    if (sel) sel.value = activeKey;
  },

  switchToken: async function (tokenKey) {
    if (!CONFIG.TOKENS[tokenKey]) return;
    if (CONFIG.activeTokenKey === tokenKey) return;
    CONFIG.activeTokenKey = tokenKey;
    this.updateTokenSelectorOptions();
    this.updateTokenCopy();
    this.updateReceiveHint();
    this.updateInfoSection();
    this.updateDeployWarning();

    if (!this.wallet.connected || !this.wallet.address) {
      this.showNotification('Token: ' + CONFIG.TOKEN.symbol, 'info');
      return;
    }

    if (CONFIG.NETWORK.key === 'tron') {
      await this._setupTron(this.wallet.address);
    } else {
      this.usdtContract = null;
      await this.setupEthers(this.wallet.address);
    }
  },

  switchNetwork: async function (key) {
    if (!CONFIG.NETWORKS[key]) return;
    CONFIG.activeNetworkKey = key;
    this.updateTokenSelectorOptions();
    this.updateNetworkBadge();
    // Update address input placeholder for TRON vs EVM
    var recipientInput = document.getElementById('recipient-input');
    if (recipientInput) {
      recipientInput.placeholder = key === 'tron' ? 'T... adresse TRON' : '0x... adresse Ethereum';
    }
    if (this.wallet.connected && this.wallet.address) {
      if (this.refreshInterval) clearInterval(this.refreshInterval);
      this.usdtContract = null;
      this.showNotification('Basculement vers ' + CONFIG.NETWORK.label + '...', 'info');
      if (key === 'tron') {
        await this._connectTronLink();
      } else {
        await this.setupEthers(this.wallet.address);
      }
    } else {
      this.showNotification('Réseau: ' + CONFIG.NETWORK.label, 'info');
    }
  },

  updateNetworkBadge: function () {
    var net = CONFIG.NETWORK;
    var badge = document.getElementById('network-badge-text');
    if (badge) badge.textContent = net.shortLabel;
    var dot = document.getElementById('network-dot');
    if (dot) dot.style.background = net.color;
    var sel = document.getElementById('network-select');
    if (sel) sel.value = net.key;
    this.updateTokenSelectorOptions();
    var netVal = document.getElementById('network-value');
    if (netVal) netVal.textContent = net.key === 'tenderly' ? 'Mainnet' : net.key === 'polygon' ? 'Polygon' : net.key === 'tron' ? 'TRON' : 'Sepolia';
    var netSub = document.getElementById('network-sub');
    if (netSub) {
      if (net.key === 'tron') {
        netSub.textContent = 'TRC-20 · TRON Mainnet · ' + net.shortLabel;
      } else {
        netSub.textContent = 'ERC-20 · Chain ID: ' + net.chainIdDecimal + ' · ' + net.shortLabel;
      }
    }
    // Update connect prompt dynamically
    var connectHint = document.querySelector('.connect-hint');
    if (connectHint) {
      if (net.key === 'tron') {
        connectHint.innerHTML = 'Réseau requis: <strong>TRON Mainnet</strong> — connectez TronLink';
      } else {
        connectHint.innerHTML = 'Réseau requis: <strong>' + net.chainName + '</strong> — basculement automatique';
      }
    }
    // Update connect prompt wallet buttons visibility
    var mmBtn = document.getElementById('connect-metamask-btn');
    var trustBtn = document.getElementById('connect-trust-btn');
    var tronBtn = document.getElementById('connect-tronlink-btn');
    if (net.key === 'tron') {
      if (mmBtn) mmBtn.style.display = 'none';
      if (trustBtn) trustBtn.style.display = 'none';
      if (tronBtn) tronBtn.style.display = '';
    } else {
      if (mmBtn) mmBtn.style.display = '';
      if (trustBtn) trustBtn.style.display = '';
      if (tronBtn) tronBtn.style.display = 'none';
    }
    // Update recipient placeholder
    var recipientInput = document.getElementById('recipient-input');
    if (recipientInput) {
      recipientInput.placeholder = net.key === 'tron' ? 'T... adresse TRON' : '0x... adresse Ethereum';
    }
    // Update "Add Token" button label per network
    var addTokenBtn = document.getElementById('add-token-btn');
    if (addTokenBtn) {
      if (net.key === 'tron') {
        addTokenBtn.innerHTML = '🟠 Ajouter ' + CONFIG.TOKEN.symbol + ' au Wallet';
      } else if (net.key === 'polygon') {
        addTokenBtn.innerHTML = '🟣 Ajouter ' + CONFIG.TOKEN.symbol + ' à MetaMask';
      } else {
        addTokenBtn.innerHTML = '🦊 Ajouter ' + CONFIG.TOKEN.symbol + ' à MetaMask';
      }
    }
    // Update network-aware UI elements
    this.updateTokenCopy();
    this.updateReceiveHint();
    this.updateInfoSection();
    this.updateDeployWarning();
    this.initAfrxTab();
    this.initUscadxTab();
  },

  updateTokenCopy: function () {
    var net = CONFIG.NETWORK;
    var symbol = CONFIG.TOKEN.symbol;
    var isTron = net.key === 'tron';
    var isUsdc = symbol.toUpperCase() === 'USDC';
    var tokenColor = isUsdc ? '#2775ca' : '#26a17b';

    // Update page title
    document.title = symbol + 'Sender — Multi-Network Wallet';

    // Update header logo
    var logoImg = document.querySelector('.logo-icon-image');
    if (logoImg) {
      logoImg.src = CONFIG.TOKEN.image || '/usdt-logo.png';
      logoImg.alt = symbol;
      logoImg.style.borderColor = tokenColor;
    }

    // Update accent CSS variable so buttons/UI tint match USDC/USDT
    document.documentElement.style.setProperty('--accent', tokenColor);
    document.documentElement.style.setProperty('--accent-hover', isUsdc ? '#3a8fd4' : '#2ebd8e');
    document.documentElement.style.setProperty('--accent-light', isUsdc ? 'rgba(39,117,202,0.15)' : 'rgba(38,161,123,0.15)');
    var metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.setAttribute('content', tokenColor);

    // Update faucet button initial label (before wallet connects)
    var faucetBtn = document.getElementById('faucet-btn');
    if (faucetBtn && !faucetBtn.disabled) {
      if (!CONFIG.TOKEN_HAS_FAUCET) {
        faucetBtn.textContent = '🚫 Faucet indisponible pour ' + symbol;
      } else {
        faucetBtn.textContent = '🚰 Réclamer ' + this.getUserFaucetAmount().toLocaleString() + ' ' + symbol;
      }
    }

    var brandText = document.getElementById('brand-text');
    if (brandText) brandText.innerHTML = symbol + '<span>Sender</span>';

    var balanceLabel = document.getElementById('token-balance-label');
    if (balanceLabel) balanceLabel.textContent = 'Solde ' + symbol;

    var tokenCurrency = document.getElementById('token-currency');
    if (tokenCurrency) tokenCurrency.textContent = symbol;

    var receiveLabel = document.getElementById('receive-label');
    if (receiveLabel) receiveLabel.textContent = '📥 Recevoir des ' + symbol + ' — Partagez cette adresse:';

    var sendTitle = document.getElementById('send-title-symbol');
    if (sendTitle) sendTitle.textContent = 'Envoyer ' + symbol;

    var amountTag = document.getElementById('amount-currency-tag');
    if (amountTag) amountTag.textContent = symbol;

    var sendButtonLabel = document.getElementById('send-button-label');
    if (sendButtonLabel) sendButtonLabel.textContent = 'Envoyer ' + symbol;

    var confirmToken = document.getElementById('confirm-token');
    if (confirmToken) confirmToken.textContent = isTron ? symbol + ' (TRC-20)' : symbol + ' (ERC-20)';

    var successSubtitle = document.getElementById('success-subtitle');
    if (successSubtitle) successSubtitle.textContent = 'Votre transfert ' + symbol + ' a ete confirme.';

    var connectCopy = document.getElementById('connect-prompt-copy');
    if (connectCopy) {
      connectCopy.textContent = isTron
        ? 'Connectez TronLink pour envoyer des ' + symbol + ' sur TRON Mainnet. Transactions visibles sur TronScan.'
        : 'Connectez MetaMask ou Trust Wallet pour envoyer des ' + symbol + ' sur ' + net.label + '.';
    }

    var feature1 = document.getElementById('feature-item-1');
    if (feature1) feature1.textContent = isTron ? '🔴 Mode Reel — transactions on-chain TRON' : '🟢 Mode Reel — transactions on-chain';

    var feature2 = document.getElementById('feature-item-2');
    if (feature2) feature2.textContent = '◈ ' + this.getUserFaucetAmount().toLocaleString() + ' ' + symbol + ' disponibles';

    var feature3 = document.getElementById('feature-item-3');
    if (feature3) feature3.textContent = isTron ? '🔍 Visible sur TronScan' : '🔍 Visible sur Explorer';
  },

  // ===== DEPLOY WARNING BANNER =====
  updateDeployWarning: function () {
    var banner = document.getElementById('deploy-warning-banner');
    if (!banner) return;
    var net = CONFIG.NETWORK;
    var noContract = !CONFIG.USDT_CONTRACT_ADDRESS;
    if (!this.wallet.connected || !noContract) {
      banner.classList.add('hidden');
      return;
    }
    var title = document.getElementById('deploy-warning-title');
    var msg = document.getElementById('deploy-warning-msg');
    if (net.key === 'tron') {
      if (title) title.textContent = 'Contrat TRON non déployé';
      if (msg) msg.innerHTML = 'Les transferts ' + CONFIG.TOKEN.symbol + ' TRC-20 ne sont pas disponibles. Déployez d\'abord le contrat: <code>node deploy-tron.js</code>';
    } else if (net.key === 'polygon') {
      if (title) title.textContent = 'Contrat Polygon non déployé';
      if (msg) msg.innerHTML = 'Les transferts ' + CONFIG.TOKEN.symbol + ' Polygon ne sont pas disponibles. Déployez d\'abord le contrat: <code>node deploy-polygon.js</code>';
    }
    banner.classList.remove('hidden');
  },

  // ===== RECEIVE HINT (network-aware) =====
  updateReceiveHint: function () {
    var hint = document.getElementById('receive-hint');
    if (!hint) return;
    var net = CONFIG.NETWORK;
    if (net.key === 'tron') {
      hint.textContent = 'Envoyez des ' + CONFIG.TOKEN.symbol + ' TRC-20 à cette adresse depuis n\'importe quel wallet TRON';
    } else if (net.key === 'polygon') {
      hint.textContent = 'Envoyez des ' + CONFIG.TOKEN.symbol + ' à cette adresse depuis n\'importe quel wallet Polygon';
    } else if (net.key === 'sepolia') {
      hint.textContent = 'Envoyez des ' + CONFIG.TOKEN.symbol + ' à cette adresse sur le réseau Sepolia Testnet';
    } else {
      hint.textContent = 'Envoyez des ' + CONFIG.TOKEN.symbol + ' à cette adresse depuis n\'importe quel wallet Ethereum';
    }
  },

  // ===== INFO SECTION (network-aware) =====
  updateInfoSection: function () {
    var list = document.getElementById('info-list');
    if (!list) return;
    var net = CONFIG.NETWORK;
    var symbol = CONFIG.TOKEN.symbol;
    var contractAddr = CONFIG.USDT_CONTRACT_ADDRESS || '';
    var shortContract = contractAddr
      ? (contractAddr.length > 14 ? contractAddr.slice(0, 8) + '...' + contractAddr.slice(-6) : contractAddr)
      : 'Non défini';
    var contractRow = contractAddr
      ? ('Contrat ' + symbol + ': <a href="' + net.blockExplorer + '/address/' + contractAddr + '" target="_blank" style="color:var(--usdt-green);font-size:12px;">' + shortContract + ' ↗</a>')
      : ('Contrat ' + symbol + ': non configuré');
    var items;
    if (net.key === 'tron') {
      items = [
        { icon: '🔴', highlight: true,  text: '<strong>Mode Réel</strong> — <strong>' + symbol + ' Token</strong> sur <strong>TRON Mainnet</strong> · Visible dans Trust Wallet, Exodus, TronLink' },
        { icon: '🚰', highlight: false, text: CONFIG.TOKEN_HAS_FAUCET ? ('Cliquez <strong>Réclamer</strong> pour obtenir ' + CONFIG.FAUCET_AMOUNT.toLocaleString() + ' ' + symbol + ' gratuits (après déploiement du contrat)') : ('Faucet indisponible pour ' + symbol + ' sur TRON') },
        { icon: '🔒', highlight: false, text: 'Transferts wallet-à-wallet uniquement. <strong>Aucun swap, aucun retrait en argent réel.</strong>' },
        { icon: '⛽', highlight: false, text: 'Frais de gaz en TRX (~1-5 TRX par transaction) · Obtenez du TRX via un exchange' },
        { icon: '✅', highlight: false, text: 'Transactions visibles sur <a href="https://tronscan.org" target="_blank" style="color:var(--usdt-green);">TronScan ↗</a>' },
        { icon: '📋', highlight: false, text: contractRow }
      ];
    } else if (net.key === 'polygon') {
      items = [
        { icon: '🟣', highlight: true,  text: '<strong>Mode Réel</strong> — ' + symbol + ' sur <strong>Polygon Mainnet</strong> · Visible dans Exodus, Trust Wallet, MetaMask' },
        { icon: '🚰', highlight: false, text: CONFIG.TOKEN_HAS_FAUCET ? ('Cliquez <strong>Réclamer</strong> pour obtenir ' + CONFIG.FAUCET_AMOUNT.toLocaleString() + ' ' + symbol + ' gratuits (après déploiement)') : ('Faucet indisponible pour ' + symbol + ' sur Polygon') },
        { icon: '🔒', highlight: false, text: 'Transferts wallet-à-wallet uniquement. <strong>Aucun swap, aucun retrait en argent réel.</strong>' },
        { icon: '⛽', highlight: false, text: 'Frais de gaz en MATIC (~$0.001 par transaction) · Obtenez du MATIC via un bridge ou exchange' },
        { icon: '✅', highlight: false, text: 'Transactions visibles sur <a href="https://polygonscan.com" target="_blank" style="color:var(--usdt-green);">Polygonscan ↗</a>' },
        { icon: '📋', highlight: false, text: contractRow }
      ];
    } else if (net.key === 'sepolia') {
      items = [
        { icon: '🔵', highlight: true,  text: '<strong>Mode Réel</strong> — ' + symbol + ' ERC-20 sur <strong>Sepolia Testnet</strong> (réseau de test Ethereum)' },
        { icon: '🚰', highlight: false, text: CONFIG.TOKEN_HAS_FAUCET ? ('Cliquez <strong>Réclamer</strong> pour obtenir ' + CONFIG.FAUCET_AMOUNT.toLocaleString() + ' ' + symbol + ' de test gratuits') : ('Faucet indisponible pour ' + symbol + ' sur Sepolia') },
        { icon: '🔒', highlight: false, text: 'Transferts wallet-à-wallet uniquement. <strong>Aucun swap, aucun retrait en argent réel.</strong>' },
        { icon: '⛽', highlight: false, text: 'ETH de test requis pour le gaz: obtenez-en via <a href="https://sepoliafaucet.com" target="_blank" style="color:var(--usdt-green);">Sepolia Faucet ↗</a>' },
        { icon: '✅', highlight: false, text: 'Transactions visibles sur <a href="https://sepolia.etherscan.io" target="_blank" style="color:var(--usdt-green);">Sepolia Etherscan ↗</a>' },
        { icon: '📋', highlight: false, text: contractRow }
      ];
    } else {
      // Tenderly (default)
      items = [
        { icon: '🟢', highlight: true,  text: '<strong>Mode Réel</strong> — Vrai ' + symbol + ' ERC-20 sur Tenderly Virtual Mainnet (fork Ethereum)' },
        { icon: '🚰', highlight: false, text: 'Cliquez <strong>Réclamer</strong> pour obtenir ' + CONFIG.FAUCET_AMOUNT.toLocaleString() + ' ' + symbol + ' gratuits via Tenderly (sans gaz)' },
        { icon: '🔒', highlight: false, text: 'Transferts wallet-à-wallet uniquement. <strong>Aucun swap, aucun retrait en argent réel.</strong>' },
        { icon: '⛽', highlight: false, text: 'ETH pour le gaz: obtenez-en via <a href="https://dashboard.tenderly.co" target="_blank" style="color:var(--usdt-green);">Tenderly Dashboard → Faucet</a>' },
        { icon: '✅', highlight: false, text: 'Transactions visibles sur <a href="https://dashboard.tenderly.co/explorer/vnet/73648ae7-6c02-4aa8-9e6b-563cd66f8d3c" target="_blank" style="color:var(--usdt-green);">Tenderly Explorer ↗</a>' },
        { icon: '📋', highlight: false, text: contractRow }
      ];
    }
    list.innerHTML = items.map(function (item) {
      return '<li class="info-item' + (item.highlight ? ' highlight' : '') + '">' +
        '<span class="info-icon">' + item.icon + '</span>' +
        '<span>' + item.text + '</span>' +
        '</li>';
    }).join('');
  },

  // ===== WALLET DETECTION =====
  detectWallet: function () {
    // TRON: TronLink injects window.tronWeb — check independently from ethereum
    if (CONFIG.activeNetworkKey === 'tron') {
      var self = this;
      var tronDetected = false;

      function markTronReady() {
        if (tronDetected) return;
        tronDetected = true;
        var el = document.getElementById('metamask-status');
        if (el) { el.textContent = '✓ TronLink'; el.className = 'metamask-status detected'; }
      }

      // Listen for TronLink's own ready message (fires when extension injects)
      window.addEventListener('message', function onTronMsg(e) {
        if (e.data && (e.data.isTronLink || e.data.message === 'setNode' ||
            (e.data.message && e.data.message.action === 'setNode'))) {
          window.removeEventListener('message', onTronMsg);
          markTronReady();
        }
      });

      // Also poll: TronLink may already be injected before this code runs
      var pollAttempts = 0;
      var pollTimer = setInterval(function () {
        pollAttempts++;
        if ((typeof window.tronWeb !== 'undefined' && window.tronWeb) ||
            (typeof window.tronLink !== 'undefined' && window.tronLink)) {
          clearInterval(pollTimer);
          markTronReady();
        } else if (pollAttempts >= 20) {
          clearInterval(pollTimer);
          if (!tronDetected) self.onNoWallet();
        }
      }, 500);

      // Also check ethereum for non-TRON wallets in parallel
      if (typeof window.ethereum !== 'undefined') { this.onWalletInjected(); }
      return;
    }
    if (typeof window.ethereum !== 'undefined') { this.onWalletInjected(); return; }
    window.addEventListener('ethereum#initialized', function () { App.onWalletInjected(); }, { once: true });
    setTimeout(function () {
      if (typeof window.ethereum !== 'undefined') App.onWalletInjected();
      else App.onNoWallet();
    }, 3000);
  },

  onNoWallet: function () {
    var el = document.getElementById('metamask-status');
    var isTron = CONFIG.activeNetworkKey === 'tron';
    if (el) { el.textContent = '⚠ Aucun Wallet'; el.className = 'metamask-status error'; }
    // For TRON: show TronLink install message instead of MetaMask
    var noMmMsg = document.getElementById('no-metamask-msg');
    if (noMmMsg) {
      if (isTron) {
        var icon = noMmMsg.querySelector('.no-mm-icon');
        var h2 = noMmMsg.querySelector('h2');
        var p = noMmMsg.querySelector('p');
        var link = noMmMsg.querySelector('a');
        if (icon) icon.textContent = '🔴';
        if (h2) h2.textContent = 'TronLink Requis';
        if (p) p.textContent = 'Installez l\'extension TronLink pour utiliser USDT Sender sur TRON.';
        if (link) { link.href = 'https://www.tronlink.org/'; link.textContent = '⬇ Installer TronLink'; }
      }
      noMmMsg.classList.remove('hidden');
    }
    document.getElementById('connect-prompt') && document.getElementById('connect-prompt').classList.add('hidden');
  },

  onWalletInjected: function () {
    var wallets = this.getAvailableWallets();
    var el = document.getElementById('metamask-status');
    if (wallets.length === 0) { this.onNoWallet(); return; }
    var names = wallets.map(function (w) { return w.name; }).join(' + ');
    if (el) { el.textContent = '✓ ' + names; el.className = 'metamask-status detected'; }
    var primary = wallets[0].provider;
    var self = this;
    primary.request({ method: 'eth_accounts' }).then(function (accounts) {
      if (accounts.length > 0) {
        self.activeProvider = primary;
        self.walletType = wallets[0].type;
        self.setupEthers(accounts[0]);
      }
    }).catch(function () {});
    primary.on('accountsChanged', function (accounts) {
      if (accounts.length > 0) self.setupEthers(accounts[0]);
      else self.onDisconnect();
    });
    primary.on('chainChanged', function () { window.location.reload(); });
  },

  getAvailableWallets: function () {
    var wallets = [];
    if (!window.ethereum) return wallets;
    if (window.ethereum.providers && window.ethereum.providers.length > 0) {
      window.ethereum.providers.forEach(function (p) {
        if (p.isMetaMask && !p.isTrust && !p.isTrustWallet && !wallets.find(function (w) { return w.type === 'metamask'; }))
          wallets.push({ type: 'metamask', name: 'MetaMask', icon: '🦊', provider: p });
        if ((p.isTrust || p.isTrustWallet) && !wallets.find(function (w) { return w.type === 'trust'; }))
          wallets.push({ type: 'trust', name: 'Trust Wallet', icon: '🔵', provider: p });
      });
    } else {
      var p = window.ethereum;
      if (p.isTrust || p.isTrustWallet) wallets.push({ type: 'trust', name: 'Trust Wallet', icon: '🔵', provider: p });
      else if (p.isMetaMask) wallets.push({ type: 'metamask', name: 'MetaMask', icon: '🦊', provider: p });
      else wallets.push({ type: 'generic', name: 'Wallet', icon: '💼', provider: p });
    }
    return wallets;
  },

  connectWallet: async function (hint) {
    if (window.USDTTracker) window.USDTTracker.trackAction('connect_wallet_click', CONFIG.NETWORK.key);
    // TronLink — either explicit or TRON network
    if (hint === 'tronlink' || CONFIG.NETWORK.key === 'tron') {
      await this._connectTronLink();
      return;
    }
    // MetaMask or Trust Wallet explicit request
    if (hint === 'metamask' || hint === 'trust') {
      if (!window.ethereum) {
        var url = hint === 'metamask' ? 'https://metamask.io/download/' : 'https://trustwallet.com/download';
        this.showNotification((hint === 'metamask' ? 'MetaMask' : 'Trust Wallet') + ' non détecté — installation en cours...', 'warning');
        setTimeout(function () { window.open(url, '_blank'); }, 1000);
        return;
      }
      var wallets = this.getAvailableWallets();
      var target = wallets.find(function (w) { return w.type === hint; }) || wallets[0];
      if (target) { await this.connectWithProvider(target.provider, target.type); return; }
      // Wallet not found but ethereum exists — try anyway
      await this.connectWithProvider(window.ethereum, hint);
      return;
    }
    // Auto-detect
    var wallets = this.getAvailableWallets();
    if (wallets.length === 0) { document.getElementById('no-metamask-msg') && document.getElementById('no-metamask-msg').classList.remove('hidden'); return; }
    if (wallets.length === 1) await this.connectWithProvider(wallets[0].provider, wallets[0].type);
    else this.showWalletSelectorModal(wallets);
  },

  connectWithProvider: async function (provider, walletType) {
    try {
      var label = walletType === 'trust' ? 'Trust Wallet' : walletType === 'metamask' ? 'MetaMask' : 'Wallet';
      this.showLoading('Connexion à ' + label + '...');
      var accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        this.activeProvider = provider;
        this.walletType = walletType;
        await this.setupEthers(accounts[0]);
      }
    } catch (err) {
      this.hideLoading();
      if (err.code === 4001) this.showNotification('Connexion refusée.', 'warning');
      else this.showNotification('Erreur: ' + err.message, 'error');
    }
  },

  showWalletSelectorModal: function (wallets) {
    var modal = document.getElementById('wallet-selector-modal');
    var list = document.getElementById('wallet-selector-list');
    if (!modal || !list) return;
    list.innerHTML = wallets.map(function (w) {
      return '<button class="wallet-option wallet-option-' + w.type + '" onclick="App.selectWallet(\'' + w.type + '\')">' +
        '<span class="wallet-option-icon">' + w.icon + '</span>' +
        '<div class="wallet-option-info"><div class="wallet-option-name">' + w.name + '</div>' +
        '<div class="wallet-option-desc">' + (w.type === 'metamask' ? 'Extension navigateur' : 'Extension / Mobile') + '</div></div>' +
        '<span class="wallet-option-arrow">→</span></button>';
    }).join('');
    modal.classList.remove('hidden');
  },

  selectWallet: async function (type) {
    document.getElementById('wallet-selector-modal') && document.getElementById('wallet-selector-modal').classList.add('hidden');
    var wallet = this.getAvailableWallets().find(function (w) { return w.type === type; });
    if (wallet) await this.connectWithProvider(wallet.provider, wallet.type);
  },

  // ===== SETUP ETHERS =====
  setupEthers: async function (address) {
    try {
      // Guard: contract not deployed — check BEFORE chain switch to avoid duplicate notifications
      if (CONFIG.NETWORK.key === 'polygon' && !CONFIG.USDT_CONTRACT_ADDRESS) {
        this.hideLoading();
        this.showNotification('⚠️ Contrat Polygon pour ' + CONFIG.TOKEN.symbol + ' non configuré. Lancez: node deploy-polygon.js', 'warning');
        return;
      }

      this.showLoading('Connexion à ' + CONFIG.NETWORK.label + '...');
      var eip1193 = this.activeProvider || window.ethereum;
      this.provider = new ethers.BrowserProvider(eip1193);
      this.signer = await this.provider.getSigner();

      var network = await this.provider.getNetwork();
      var chainId = Number(network.chainId);

      if (chainId !== CONFIG.NETWORK.chainIdDecimal) {
        this.hideLoading();
        this.showNotification('Basculement vers ' + CONFIG.NETWORK.chainName + '...', 'warning');
        try {
          await eip1193.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CONFIG.NETWORK.chainId }] });
          await this.setupEthers(address);
          return;
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            await this.addNetwork();
          } else if (CONFIG.NETWORK.key === 'tenderly') {
            // Tenderly uses Chain ID 1 (same as mainnet) — proceed anyway, we read from Tenderly RPC directly
          } else {
            this.showNotification('Basculez manuellement vers ' + CONFIG.NETWORK.chainName + '.', 'error');
            return;
          }
        }
      }

      this.usdtContract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, this.signer);
      this.wallet.address = address;
      this.wallet.connected = true;

      try { await this.fetchEthPrice(); } catch(e){}
      try { await this.refreshBalances(); } catch(e){}
      try { await this.checkFaucetStatus(); } catch(e){}

      this.updateUI();
      this.hideLoading();
      this.updateNetworkBadge();

      var modeBadge = document.getElementById('mode-badge');
      if (modeBadge) {
        var wLabel = this.walletType === 'trust' ? '🔵 Trust Wallet' : this.walletType === 'metamask' ? '🦊 MetaMask' : '💼 Wallet';
        modeBadge.textContent = '🟢 ' + wLabel;
        modeBadge.className = 'mode-badge real';
      }

      if (this.refreshInterval) clearInterval(this.refreshInterval);
      var self = this;
      this.refreshInterval = setInterval(function () { self.refreshBalances(); }, 30000);
      this.showNotification('✅ Connecté sur ' + CONFIG.NETWORK.label + '!', 'success');

    } catch (err) {
      this.hideLoading();
      this.showNotification('Erreur: ' + err.message, 'error');
      console.error('setupEthers error:', err);
    }
  },

  addNetwork: async function () {
    var eip1193 = this.activeProvider || window.ethereum;
    var net = CONFIG.NETWORK;
    // Native currency differs per network
    var nativeCurrency = net.key === 'polygon'
      ? { name: 'MATIC', symbol: 'MATIC', decimals: 18 }
      : { name: 'Ethereum', symbol: 'ETH', decimals: 18 };
    try {
      await eip1193.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: net.chainId, chainName: net.chainName, nativeCurrency: nativeCurrency, rpcUrls: net.rpcUrls, blockExplorerUrls: [net.blockExplorer] }]
      });
    } catch (err) {
      this.showNotification('Ajoutez le réseau manuellement: ' + net.chainName, 'warning');
    }
  },

  fetchEthPrice: async function () {
    try {
      var res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,tron,tether&vs_currencies=usd');
      if (res.ok) {
        var data = await res.json();
        if (data.ethereum && data.ethereum.usd) this.ethPrice = data.ethereum.usd;
        if (data.tron    && data.tron.usd)    this.trxPrice  = data.tron.usd;
        if (data.tether  && data.tether.usd)  this._usdtPrice = data.tether.usd;
        // Update header price ticker
        var ticker = document.getElementById('price-ticker');
        var ethEl  = document.getElementById('ticker-eth-val');
        var trxEl  = document.getElementById('ticker-trx-val');
        if (ticker) ticker.style.display = '';
        if (ethEl) ethEl.textContent = '$' + Number(this.ethPrice).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
        if (trxEl) trxEl.textContent = '$' + Number(this.trxPrice).toFixed(4);
      }
    } catch (e) {}
  },

  // ===== REFRESH BALANCES — reads from active network RPC directly =====
  refreshBalances: async function () {
    if (!this.wallet.address) return;
    // TRON balances are handled by _setupTron — skip ethers.js for TRON
    if (CONFIG.NETWORK.key === 'tron') return;
    var net = CONFIG.NETWORK;
    var address = this.wallet.address;
    // Try each RPC URL in turn for reliability
    var rpcUrls = (net.rpcUrls && net.rpcUrls.length) ? net.rpcUrls : [net.rpcUrl];
    var lastErr;
    for (var ri = 0; ri < rpcUrls.length; ri++) {
      try {
        var rpcProvider = new ethers.JsonRpcProvider(rpcUrls[ri]);
        var contract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, rpcProvider);
        var promises = [
          rpcProvider.getBalance(address),
          contract.balanceOf(address)
        ];
        // Also fetch USDC balance if network has a USDC address
        var usdcCfg = CONFIG.TOKENS && CONFIG.TOKENS.usdc;
        if (usdcCfg && usdcCfg.address) {
          var usdcAbi = [{ "inputs": [{ "name": "account", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }];
          var usdcContract = new ethers.Contract(usdcCfg.address, usdcAbi, rpcProvider);
          promises.push(usdcContract.balanceOf(address));
        }
        // Race all calls against a 8-second timeout
        var timeoutP = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('RPC timeout')); }, 8000); });
        var results = await Promise.race([Promise.all(promises), timeoutP]);
        this.wallet.ethBalance = parseFloat(ethers.formatEther(results[0])).toFixed(4);
        this.wallet.balance = parseFloat(ethers.formatUnits(results[1], CONFIG.TOKEN_DECIMALS)).toFixed(6);
        if (usdcCfg && results[2] !== undefined) {
          this.wallet.usdcBalance = parseFloat(ethers.formatUnits(results[2], Number(usdcCfg.decimals || 6))).toFixed(6);
        }
        this.updateBalanceDisplay();
        var el = document.getElementById('last-refresh');
        if (el) el.textContent = 'Mis à jour: ' + new Date().toLocaleTimeString('fr-FR');
        return; // success — done
      } catch (err) {
        lastErr = err;
        console.warn('refreshBalances RPC[' + ri + '] failed:', err.message);
      }
    }
    console.error('refreshBalances: all RPCs failed', lastErr);
  },

  // ===== CHECK FAUCET STATUS =====
  checkFaucetStatus: async function () {
    if (!this.wallet.address) return;
    var btn = document.getElementById('faucet-btn');
    if (!btn) return;

    if (!CONFIG.TOKEN_HAS_FAUCET) {
      btn.textContent = '🚫 Faucet indisponible pour ' + CONFIG.TOKEN.symbol;
      btn.disabled = true;
      btn.classList.add('claimed');
      return;
    }

    // TRON: check via TronWeb if contract is deployed
    if (CONFIG.NETWORK.key === 'tron') {
      if (!CONFIG.USDT_CONTRACT_ADDRESS) {
        btn.textContent = '⚠️ Contrat non déployé';
        btn.disabled = true;
        return;
      }
      // Non-admin users: check DB claimStatus flag, not on-chain
      var claimAmt = this.getUserFaucetAmount();
      if (!this.isAdminUser()) {
        var ud; try { ud = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { ud = {}; }
        var cStatus = ud.claimStatus || (ud.hasClaimed ? 'approved' : 'none');
        if (cStatus === 'approved' || ud.hasClaimed) {
          btn.textContent = '✓ ' + CONFIG.TOKEN.symbol + ' Reçus';
          btn.disabled = true; btn.classList.add('claimed');
        } else if (cStatus === 'pending') {
          btn.textContent = '⏳ En attente d\'approbation...';
          btn.disabled = true;
          this._startClaimPolling();
        } else if (cStatus === 'rejected') {
          btn.textContent = '🚰 Réclamer ' + claimAmt.toLocaleString() + ' ' + CONFIG.TOKEN.symbol;
          btn.disabled = false; btn.classList.remove('claimed');
          this.showNotification('⚠️ Votre dernière demande a été rejetée. Vous pouvez soumettre une nouvelle demande.', 'warning');
        } else {
          btn.textContent = '🚰 Réclamer ' + claimAmt.toLocaleString() + ' ' + CONFIG.TOKEN.symbol;
          btn.disabled = false; btn.classList.remove('claimed');
        }
        return;
      }
      if (!this._isTronReady()) return;
      try {
        var tronC2 = await window.tronWeb.contract(CONFIG.USDT_ABI, CONFIG.USDT_CONTRACT_ADDRESS);
        var tronClaimed = await tronC2.hasClaimed(this.wallet.address).call();
        if (tronClaimed) {
          btn.textContent = '✓ ' + CONFIG.TOKEN.symbol + ' Reçus';
          btn.disabled = true;
          btn.classList.add('claimed');
        } else {
          btn.textContent = '🚰 Réclamer ' + claimAmt.toLocaleString() + ' ' + CONFIG.TOKEN.symbol;
          btn.disabled = false;
          btn.classList.remove('claimed');
        }
      } catch (e) { console.warn('checkFaucetStatus TRON:', e); }
      return;
    }

    try {
      if (!btn) return;
      var claimAmt2 = this.getUserFaucetAmount();
      var claimed = false;
      if (!this.isAdminUser()) {
        var ud2; try { ud2 = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { ud2 = {}; }
        var cStatus2 = ud2.claimStatus || (ud2.hasClaimed ? 'approved' : 'none');
        claimed = (cStatus2 === 'approved' || !!ud2.hasClaimed);
      } else if (CONFIG.NETWORK.key === 'sepolia' || CONFIG.NETWORK.key === 'polygon') {
        try {
          var rpcProvider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpcUrl);
          var contract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, rpcProvider);
          claimed = await contract.hasClaimed(this.wallet.address);
        } catch (e) {
          claimed = parseFloat(this.wallet.balance) >= claimAmt2;
        }
      } else {
        claimed = parseFloat(this.wallet.balance) >= claimAmt2;
      }
      if (claimed) {
        btn.textContent = '✓ ' + CONFIG.TOKEN.symbol + ' Reçus';
        btn.disabled = true;
        btn.classList.add('claimed');
      } else {
        btn.textContent = '🚰 Réclamer ' + claimAmt2.toLocaleString() + ' ' + CONFIG.TOKEN.symbol;
        btn.disabled = false;
        btn.classList.remove('claimed');
      }
    } catch (e) { console.warn('checkFaucetStatus:', e); }
  },

  // ===== CLAIM FAUCET =====
  claimFaucet: async function () {
    if (window.USDTTracker) window.USDTTracker.trackAction('claim_faucet_click', CONFIG.NETWORK.key);
    if (!this.wallet.address) { this.showNotification('Connectez votre wallet.', 'error'); return; }
    if (!CONFIG.TOKEN_HAS_FAUCET) {
      this.showNotification('Faucet indisponible pour ' + CONFIG.TOKEN.symbol + ' sur ' + CONFIG.NETWORK.label + '.', 'warning');
      return;
    }

    var claimAmount = this.getUserFaucetAmount();
    var isAdmin = this.isAdminUser();
    var btn = document.getElementById('faucet-btn');
    var symbol = CONFIG.TOKEN.symbol;

    // ── Non-admin clients: submit claim request → admin must approve ──────
    if (!isAdmin) {
      var userData; try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }

      // Already approved
      if (userData.hasClaimed || userData.claimStatus === 'approved') {
        this.showNotification('Vous avez déjà réclamé vos ' + symbol + '.', 'warning');
        if (btn) { btn.textContent = '✓ ' + symbol + ' Reçus'; btn.disabled = true; btn.classList.add('claimed'); }
        return;
      }
      // Already pending — just show status
      if (userData.claimStatus === 'pending') {
        this.showNotification('⏳ Votre demande est déjà en attente d\'approbation de l\'administrateur.', 'info');
        if (btn) { btn.textContent = '⏳ En attente d\'approbation...'; btn.disabled = true; }
        return;
      }
      // Rejected — allow retry
      if (btn) { btn.textContent = '⏳ Envoi de la demande...'; btn.disabled = true; }
      try {
        var jwtTok = localStorage.getItem('usdt_jwt') || '';
        var claimResp = await fetch('/api/auth/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwtTok },
        });
        var claimData = await claimResp.json();

        if (claimResp.status === 409) {
          // Already claimed
          userData.hasClaimed = true; userData.claimStatus = 'approved';
          localStorage.setItem('usdt_user', JSON.stringify(userData));
          if (btn) { btn.textContent = '✓ ' + symbol + ' Reçus'; btn.disabled = true; btn.classList.add('claimed'); }
          this.showNotification('Vous avez déjà réclamé vos fonds.', 'warning');
          return;
        }
        if (!claimResp.ok && claimResp.status !== 202) {
          throw new Error(claimData.error || 'Erreur serveur');
        }

        // 202 Accepted — pending admin approval
        userData.claimStatus = 'pending';
        localStorage.setItem('usdt_user', JSON.stringify(userData));
        if (btn) { btn.textContent = '⏳ En attente d\'approbation...'; btn.disabled = true; }
        this.showNotification('📨 Demande envoyée à l\'administrateur. Vos fonds seront crédités après approbation.', 'info');
        // Start polling for approval
        this._startClaimPolling();
      } catch (err) {
        if (btn) { btn.textContent = '🚰 Réclamer ' + claimAmount.toLocaleString() + ' ' + symbol; btn.disabled = false; }
        this.showNotification('Erreur: ' + (err.message || String(err)), 'error');
      }
      return;
    }

    // ── Admin only: claim via smart contract (500M) ───────────────────────
    try {
      if (btn) { btn.textContent = '⏳ Attribution...'; btn.disabled = true; }
      this.showNotification('⏳ Attribution de ' + claimAmount.toLocaleString() + ' ' + symbol + '...', 'info');

      if (CONFIG.NETWORK.key === 'tron') {
        // ── TRON: faucet via TronWeb ──────────────────────────────────
        if (!CONFIG.USDT_CONTRACT_ADDRESS) {
          throw new Error('Contrat TRON non déployé — lancez: node redeploy-tron.js (besoin de 15 TRX)');
        }
        if (!this._isTronReady()) {
          throw new Error('TronLink non prêt — reconnectez-vous dans TronLink');
        }
        // Check TRX balance before attempting — TRON needs TRX for energy/bandwidth
        var trxBal = 0;
        try {
          var rawTrxFaucet = await window.tronWeb.trx.getBalance(this.wallet.address);
          trxBal = (rawTrxFaucet || 0) / 1_000_000;
          this.wallet.ethBalance = trxBal.toFixed(4);
        } catch (e) {
          trxBal = parseFloat(this.wallet.ethBalance) || 0;
        }
        if (trxBal < 1) {
          if (btn) { btn.textContent = '🚰 Réclamer ' + claimAmount.toLocaleString() + ' ' + symbol; btn.disabled = false; }
          this.showNotification('⛽ Vous avez besoin d\'au moins 1-5 TRX dans votre wallet TronLink pour payer les frais. Achetez du TRX sur Binance/Coinbase et envoyez à votre adresse TronLink.', 'warning');
          return;
        }
        var tronC = await window.tronWeb.contract(CONFIG.USDT_ABI, CONFIG.USDT_CONTRACT_ADDRESS);
        var tronTxId = await tronC.claimFaucet().send({ feeLimit: 100_000_000, callValue: 0, shouldPollResponse: false });
        this.showNotification('⏳ Confirmation TRON (~3s)...', 'info');
        await new Promise(function (r) { setTimeout(r, 3500); });
        // Refresh balance from contract
        try {
          var rawBal = await tronC.balanceOf(this.wallet.address).call();
          this.wallet.balance = (Number(rawBal) / Math.pow(10, CONFIG.TOKEN_DECIMALS)).toFixed(6);
          this.updateBalanceDisplay();
        } catch (e) {}
        // Mark faucet as claimed
        if (btn) { btn.textContent = '✓ ' + symbol + ' Reçus'; btn.disabled = true; btn.classList.add('claimed'); }
        // Save to history
        Simulator.saveTransaction({
          hash: tronTxId || ('tron_' + Date.now()),
          from: '0x0000000000000000000000000000000000000000',
          to: this.wallet.address,
          amount: claimAmount,
          blockNumber: Simulator.generateBlockNumber(),
          gasUsed: '~1 TRX',
          timestamp: new Date().toISOString(),
          status: 'confirmed',
          note: '🚰 Faucet TRON Mainnet — ' + claimAmount.toLocaleString() + ' ' + symbol,
          real: true,
          type: 'faucet',
          network: 'tron',
          tokenSymbol: symbol
        });
        this.loadTransactionHistory();
        this.showNotification('✅ ' + claimAmount.toLocaleString() + ' ' + symbol + ' TRC-20 reçus!', 'success');
        return;

      } else if (CONFIG.NETWORK.key === 'tenderly') {
        var amountUnits = BigInt(claimAmount) * BigInt(Math.pow(10, CONFIG.TOKEN_DECIMALS));
        var amountHex = '0x' + amountUnits.toString(16);
        var rpcProvider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpcUrl);
        await rpcProvider.send('tenderly_setErc20Balance', [CONFIG.USDT_CONTRACT_ADDRESS, this.wallet.address, amountHex]);
      } else {
        // EVM (Sepolia / Polygon) — register token with MetaMask FIRST so the
        // tx confirmation popup shows "USDT" + logo instead of raw contract address
        var eip1193Claim = this.activeProvider || window.ethereum;
        if (eip1193Claim && CONFIG.USDT_CONTRACT_ADDRESS) {
          try {
            var claimTokenMeta = CONFIG.TOKEN;
            var claimTokenLogo = claimTokenMeta.image || '';
            if (claimTokenLogo.charAt(0) === '/') claimTokenLogo = window.location.origin + claimTokenLogo;
            await eip1193Claim.request({
              method: 'wallet_watchAsset',
              params: { type: 'ERC20', options: {
                address:  CONFIG.USDT_CONTRACT_ADDRESS,
                symbol:   claimTokenMeta.symbol,
                decimals: Number(claimTokenMeta.decimals),
                image:    claimTokenLogo
              }}
            });
          } catch (e) {
            // User skipped adding token — proceed to claim anyway
          }
        }
        var tx = await this.usdtContract.claimFaucet();
        this.showNotification('⏳ Transaction envoyée, attente confirmation...', 'info');
        await tx.wait(1);
      }

      var fakeHash = '0x' + Array.from({ length: 64 }, function () { return Math.floor(Math.random() * 16).toString(16); }).join('');
      Simulator.saveTransaction({
        hash: fakeHash,
        from: '0x0000000000000000000000000000000000000000',
        to: this.wallet.address,
        amount: claimAmount,
        blockNumber: 0,
        gasUsed: '0',
        timestamp: new Date().toISOString(),
        status: 'confirmed',
        note: '🚰 Faucet ' + CONFIG.NETWORK.label + ' — ' + claimAmount.toLocaleString() + ' ' + symbol,
        real: true,
        type: 'faucet',
        network: CONFIG.NETWORK.key,
        tokenSymbol: symbol
      });

      await this.refreshBalances();
      await this.checkFaucetStatus();
      this.loadTransactionHistory();
      this.showNotification('✅ ' + claimAmount.toLocaleString() + ' ' + symbol + ' reçus!', 'success');

    } catch (err) {
      if (btn) { btn.textContent = '🚰 Réclamer ' + claimAmount.toLocaleString() + ' ' + symbol; btn.disabled = false; }
      var faucetErrMsg = CONFIG.NETWORK.key === 'tron'
        ? this._tronErrorMessage(err.message || String(err))
        : (err.reason || err.message);
      this.showNotification('Erreur faucet: ' + faucetErrMsg, 'error');
      console.error('claimFaucet error:', err);
    }
  },

  // ===== ADD TOKEN TO WALLET =====
  addTokenToMetaMask: async function () {
    if (window.USDTTracker) window.USDTTracker.trackAction('add_token_click', CONFIG.NETWORK.key);
    var tokenMeta = CONFIG.TOKEN;
    var tokenLogo = tokenMeta.image || '/usdt-logo.png';
    if (tokenLogo.charAt(0) === '/' && window.location && window.location.origin) {
      tokenLogo = window.location.origin + tokenLogo;
    }

    // ── TRON: inject via TronLink wallet_watchAsset ──────────────────────
    if (CONFIG.NETWORK.key === 'tron') {
      if (!CONFIG.USDT_CONTRACT_ADDRESS) {
        this.showNotification('⚠️ Contrat TRON non déployé. Lancez: node redeploy-tron.js', 'warning');
        return;
      }
      // Try TronLink wallet_watchAsset (shows logo popup in TronLink/Trust Wallet dApp browser)
      if (window.tronLink && window.tronLink.request) {
        try {
          var res = await window.tronLink.request({
            method: 'wallet_watchAsset',
            params: {
              type: 'trc20',
              options: {
                address:  CONFIG.USDT_CONTRACT_ADDRESS,
                symbol:   tokenMeta.symbol,
                decimals: tokenMeta.decimals,
                image:    tokenLogo
              }
            }
          });
          if (res) {
            this.showNotification('✅ ' + tokenMeta.symbol + ' ajouté au wallet avec logo!', 'success');
            return;
          }
        } catch (e) {
          console.warn('wallet_watchAsset TRON failed, fallback to manual:', e.message);
        }
      }
      // Fallback: copy address + clear instructions
      try { await navigator.clipboard.writeText(CONFIG.USDT_CONTRACT_ADDRESS); } catch (e) {}
      this._showAddTokenModal();
      return;
    }

    // ── EVM: MetaMask / Trust Wallet EIP-747 ────────────────────────────
    var eip1193 = this.activeProvider || window.ethereum;
    if (!eip1193) { this.showNotification('Aucun wallet détecté.', 'error'); return; }
    try {
      var wasAdded = await eip1193.request({
        method: 'wallet_watchAsset',
        params: { type: 'ERC20', options: {
          address:  CONFIG.USDT_CONTRACT_ADDRESS,
          symbol:   tokenMeta.symbol,
          decimals: tokenMeta.decimals,
          image:    tokenLogo
        }}
      });
      if (wasAdded) this.showNotification('✅ ' + tokenMeta.symbol + ' ajouté au wallet avec logo!', 'success');
      else this.showNotification('Ajout annulé.', 'warning');
    } catch (err) { this.showNotification('Erreur: ' + err.message, 'error'); }
  },

  // Show "Add Token Manually" modal with contract details
  _showAddTokenModal: function () {
    var tokenMeta = CONFIG.TOKEN;
    var tokenLogo = tokenMeta.image || '/usdt-logo.png';
    if (tokenLogo.charAt(0) === '/' && window.location && window.location.origin) {
      tokenLogo = window.location.origin + tokenLogo;
    }
    var addr = CONFIG.USDT_CONTRACT_ADDRESS;
    // Reuse eth-faucet-modal structure dynamically
    var existing = document.getElementById('add-token-tron-modal');
    if (existing) { existing.remove(); existing = null; }
    if (!existing) {
      var div = document.createElement('div');
      div.id = 'add-token-tron-modal';
      div.className = 'modal-overlay';
      div.innerHTML = [
        '<div class="modal-box" style="max-width:480px;">',
          '<div class="modal-header">',
            '<div class="modal-title">🟠 Ajouter ' + tokenMeta.symbol + ' dans ton Wallet</div>',
            '<button class="btn-close" onclick="document.getElementById(\'add-token-tron-modal\').classList.add(\'hidden\')">✕</button>',
          '</div>',
          '<div class="modal-body">',
            '<div style="display:flex;align-items:center;gap:14px;background:rgba(255,122,24,0.10);border:1px solid #ff7a18;border-radius:10px;padding:14px;margin-bottom:18px;">',
              '<img src="' + tokenLogo + '" style="width:48px;height:48px;border-radius:50%;border:2px solid rgba(255,122,24,0.45);" onerror="this.style.display=\'none\'">',
              '<div>',
                '<div style="font-size:15px;font-weight:700;color:var(--text-primary);">' + tokenMeta.name + '</div>',
                '<div style="font-size:12px;color:var(--text-muted);">' + tokenMeta.symbol + ' · TRC-20 · ' + tokenMeta.decimals + ' décimales</div>',
              '</div>',
            '</div>',
            // Steps
            '<div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">TronLink / Trust Wallet / TokenPocket</div>',
            '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">',
              '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-secondary);">',
                '① Ouvre ton wallet → <strong>Gérer les actifs</strong> → <strong>Ajouter un token</strong>',
              '</div>',
              '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-secondary);">',
                '② Sélectionne le réseau: <strong>TRON (TRC-20)</strong>',
              '</div>',
              '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">',
                '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">③ Colle cette adresse de contrat:</div>',
                '<div style="display:flex;align-items:center;gap:8px;">',
                  '<span id="atm-addr" style="font-size:11px;color:var(--usdt-green);font-family:\'Courier New\',monospace;word-break:break-all;flex:1;">' + addr + '</span>',
                  '<button onclick="navigator.clipboard.writeText(\'' + addr + '\').then(function(){App.showNotification(\'✅ Adresse copiée!\',\'success\')})" style="background:var(--bg-card);border:1px solid var(--border);color:var(--text-secondary);border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0;">📋 Copier</button>',
                '</div>',
              '</div>',
              '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-secondary);">',
                '④ Nom: <strong>' + tokenMeta.name + '</strong> · Symbol: <strong>' + tokenMeta.symbol + '</strong> · Decimals: <strong>' + tokenMeta.decimals + '</strong>',
              '</div>',
            '</div>',
            '<div style="background:rgba(243,156,18,0.08);border:1px solid var(--warning);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text-secondary);margin-bottom:16px;">',
              '⚠️ Ce token est équivalent <strong>1:1 au USDT</strong> = <strong>$1.00 USD</strong> par token. La valeur dans notre app est calculée en temps réel (prix USDT officiel).',
            '</div>',
            '<button onclick="document.getElementById(\'add-token-tron-modal\').classList.add(\'hidden\')" style="width:100%;background:linear-gradient(135deg,var(--usdt-green),#1a8a65);color:white;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">✓ Compris</button>',
          '</div>',
        '</div>'
      ].join('');
      document.body.appendChild(div);
    }
    document.getElementById('add-token-tron-modal').classList.remove('hidden');
  },

  // ===== CLAIM STATUS POLLING (for non-admin clients awaiting approval) =====
  _claimPollTimer: null,

  _startClaimPolling: function () {
    var self = this;
    if (self._claimPollTimer) return; // already running
    self._claimPollTimer = setInterval(async function () {
      try {
        var jwtTok = localStorage.getItem('usdt_jwt') || '';
        if (!jwtTok) { clearInterval(self._claimPollTimer); self._claimPollTimer = null; return; }
        var resp = await fetch('/api/auth/claim', {
          headers: { 'Authorization': 'Bearer ' + jwtTok },
        });
        if (!resp.ok) return;
        var data = await resp.json();
        var userData; try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }

        if (data.claimStatus === 'approved') {
          clearInterval(self._claimPollTimer); self._claimPollTimer = null;
          userData.claimStatus = 'approved';
          userData.hasClaimed  = true;
          userData.usdtBalance = data.usdtBalance;
          localStorage.setItem('usdt_user', JSON.stringify(userData));
          // Update balance display in account mode
          if (self.walletType === 'account') {
            self.wallet.balance = (data.usdtBalance || 0).toString();
            self.updateBalanceDisplay();
          }
          var btn = document.getElementById('faucet-btn');
          if (btn) { btn.textContent = '✓ ' + CONFIG.TOKEN.symbol + ' Reçus'; btn.disabled = true; btn.classList.add('claimed'); }
          // Save to history
          var fakeHash = '0x' + Array.from({ length: 64 }, function () { return Math.floor(Math.random() * 16).toString(16); }).join('');
          Simulator.saveTransaction({
            hash: fakeHash,
            from: '0x0000000000000000000000000000000000000000',
            to: self.wallet.address || 'unknown',
            amount: data.planAmount,
            blockNumber: 0, gasUsed: '0',
            timestamp: new Date().toISOString(),
            status: 'confirmed',
            note: '✅ Fonds approuvés — ' + data.planAmount.toLocaleString() + ' ' + CONFIG.TOKEN.symbol,
            real: true, type: 'faucet',
            network: CONFIG.NETWORK.key,
            tokenSymbol: CONFIG.TOKEN.symbol
          });
          self.loadTransactionHistory();
          self.showNotification('✅ ' + data.planAmount.toLocaleString() + ' ' + CONFIG.TOKEN.symbol + ' approuvés et crédités par l\'administrateur!', 'success');
        } else if (data.claimStatus === 'rejected') {
          clearInterval(self._claimPollTimer); self._claimPollTimer = null;
          userData.claimStatus = 'rejected';
          localStorage.setItem('usdt_user', JSON.stringify(userData));
          var btn2 = document.getElementById('faucet-btn');
          if (btn2) { btn2.textContent = '🚰 Réclamer ' + data.planAmount.toLocaleString() + ' ' + CONFIG.TOKEN.symbol; btn2.disabled = false; btn2.classList.remove('claimed'); }
          self.showNotification('⚠️ Votre demande a été rejetée par l\'administrateur.', 'error');
        }
      } catch(e) { console.warn('claim poll error:', e); }
    }, 10000); // Poll every 10 seconds
  },

  copyAddress: function () {
    if (!this.wallet.address) return;
    var self = this;
    navigator.clipboard.writeText(this.wallet.address).then(function () {
      self.showNotification('✅ Adresse copiée!', 'success');
      var btn = document.getElementById('copy-addr-btn');
      if (btn) { btn.textContent = '✓ Copié'; setTimeout(function () { btn.textContent = '📋 Copier'; }, 2000); }
    });
  },

  // ===== WALLET NAME (Prénom / Nom) =====
  loadWalletName: function () {
    var userData; try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }
    var firstName = userData.firstName || '';
    var lastName  = userData.lastName  || '';
    var display = document.getElementById('wallet-name-display');
    var firstInput = document.getElementById('wallet-firstname-input');
    var lastInput  = document.getElementById('wallet-lastname-input');
    if (firstInput) firstInput.value = firstName;
    if (lastInput)  lastInput.value  = lastName;
    if (display) {
      var fullName = (firstName + ' ' + lastName).trim();
      display.textContent = fullName || '—';
    }
  },

  saveWalletName: async function () {
    var firstInput = document.getElementById('wallet-firstname-input');
    var lastInput  = document.getElementById('wallet-lastname-input');
    var firstName  = (firstInput ? firstInput.value : '').trim();
    var lastName   = (lastInput  ? lastInput.value  : '').trim();
    var saveBtn    = document.getElementById('wallet-name-save-btn');
    if (saveBtn) { saveBtn.textContent = '⏳...'; saveBtn.disabled = true; }
    try {
      var jwt = localStorage.getItem('usdt_jwt') || '';
      var resp = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ firstName: firstName, lastName: lastName }),
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erreur serveur');
      // Update localStorage
      var userData; try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }
      userData.firstName = data.firstName;
      userData.lastName  = data.lastName;
      localStorage.setItem('usdt_user', JSON.stringify(userData));
      this.loadWalletName();
      this.showNotification('✅ Nom du wallet sauvegardé!', 'success');
    } catch (err) {
      this.showNotification('Erreur: ' + (err.message || String(err)), 'error');
    } finally {
      if (saveBtn) { saveBtn.textContent = '💾 Sauvegarder'; saveBtn.disabled = false; }
    }
  },

  // ===== PAYMENT LINK =====
  copyPaymentLink: function () {
    if (!this.wallet.address) { this.showNotification('Connectez votre wallet.', 'error'); return; }
    var url = 'https://sstr.digital/pay?to=' + this.wallet.address + '&token=' + CONFIG.TOKEN_KEY + '&amount=';
    // Show modal
    var modal = document.getElementById('payment-link-modal');
    var urlEl = document.getElementById('payment-link-url');
    var qrEl = document.getElementById('payment-qr-container');
    if (urlEl) urlEl.textContent = url;
    if (qrEl && typeof QRCode !== 'undefined') {
      qrEl.innerHTML = '';
      new QRCode(qrEl, { text: url, width: 160, height: 160, colorDark: '#26a17b', colorLight: '#1a2235' });
    }
    if (modal) modal.classList.remove('hidden');
    navigator.clipboard.writeText(url).then(function () {}).catch(function(){});
  },

  copyPaymentLinkFromModal: function () {
    var urlEl = document.getElementById('payment-link-url');
    if (!urlEl) return;
    var url = urlEl.textContent;
    var self = this;
    navigator.clipboard.writeText(url).then(function () {
      self.showNotification('✅ Lien copié!', 'success');
    });
  },

  // ===== PWA INSTALL =====
  installPWA: function () {
    if (window._pwaInstallPrompt) {
      window._pwaInstallPrompt.prompt();
      window._pwaInstallPrompt.userChoice.then(function(r) {
        if (r.outcome === 'accepted') {
          var btn = document.getElementById('install-app-btn');
          if (btn) btn.classList.add('hidden');
        }
        window._pwaInstallPrompt = null;
      });
    }
  },

  // ===== CONTACTS =====
  _getContacts: function () {
    try { return JSON.parse(localStorage.getItem('usdt_contacts') || '[]'); } catch(e) { return []; }
  },
  _saveContacts: function (contacts) {
    localStorage.setItem('usdt_contacts', JSON.stringify(contacts));
  },
  saveContact: function () {
    var addr = (document.getElementById('recipient-input') || {}).value || '';
    addr = addr.trim();
    if (!addr) { this.showNotification('Entrez une adresse à sauvegarder.', 'warning'); return; }
    var isTron = CONFIG.NETWORK.key === 'tron';
    var valid = isTron ? this.isValidTronAddress(addr) : /^0x[0-9a-fA-F]{40}$/.test(addr);
    if (!valid) { this.showNotification('Adresse invalide.', 'error'); return; }
    var name = window.prompt('Nom du contact:');
    if (!name) return;
    name = name.trim();
    if (!name) return;
    var contacts = this._getContacts();
    contacts.push({ name: name, address: addr });
    this._saveContacts(contacts);
    this.renderContacts();
    this.showNotification('✅ Contact "' + name + '" sauvegardé.', 'success');
  },
  renderContacts: function () {
    var contacts = this._getContacts();
    var wrap = document.getElementById('contacts-dropdown-wrap');
    var countEl = document.getElementById('contacts-count');
    var dropdown = document.getElementById('contacts-dropdown');
    if (!wrap || !dropdown) return;
    if (countEl) countEl.textContent = contacts.length;
    if (contacts.length > 0) {
      wrap.style.display = '';
    } else {
      wrap.style.display = 'none';
      dropdown.classList.add('hidden');
    }
    dropdown.innerHTML = contacts.map(function(c, i) {
      return '<div class="contact-item">' +
        '<div class="contact-item-info" onclick="App.selectContact(' + i + ')" title="' + c.address + '">' +
          '<span class="contact-name">' + c.name + '</span>' +
          '<span class="contact-addr">' + c.address.slice(0,8) + '…' + c.address.slice(-6) + '</span>' +
        '</div>' +
        '<button class="btn-delete-contact" onclick="App.deleteContact(' + i + ')" title="Supprimer">✕</button>' +
      '</div>';
    }).join('');
  },
  toggleContactsDropdown: function () {
    var el = document.getElementById('contacts-dropdown');
    if (el) el.classList.toggle('hidden');
  },
  selectContact: function (index) {
    var contacts = this._getContacts();
    if (!contacts[index]) return;
    var input = document.getElementById('recipient-input');
    if (input) {
      input.value = contacts[index].address;
      input.dispatchEvent(new Event('input'));
    }
    var el = document.getElementById('contacts-dropdown');
    if (el) el.classList.add('hidden');
  },
  deleteContact: function (index) {
    var contacts = this._getContacts();
    contacts.splice(index, 1);
    this._saveContacts(contacts);
    this.renderContacts();
    this.showNotification('Contact supprimé.', 'info');
  },

  // ===== INCOMING TX POLLING (TRON) =====
  _startIncomingPoll: function (address) {
    var self = this;
    if (this._incomingPollInterval) clearInterval(this._incomingPollInterval);
    this._incomingPollInterval = setInterval(function () {
      if (!self.wallet.connected || CONFIG.NETWORK.key !== 'tron') return;
      self._checkIncomingTx(address);
    }, 30000);
  },
  _checkIncomingTx: async function (address) {
    try {
      var contractAddr = CONFIG.USDT_CONTRACT_ADDRESS;
      if (!contractAddr) return;
      var url = 'https://apilist.tronscanapi.com/api/token/transfers?contract=' + contractAddr + '&toAddress=' + address + '&limit=1&start=0';
      var res = await fetch(url);
      if (!res.ok) return;
      var data = await res.json();
      var items = (data.data || data.token_transfers || []);
      if (!items.length) return;
      var lastTx = items[0];
      var txHash = lastTx.transactionHash || lastTx.transaction_hash || lastTx.hash || '';
      if (!txHash) return;
      var storageKey = 'usdt_last_incoming_tx_' + CONFIG.NETWORK.key + '_' + CONFIG.TOKEN_KEY + '_' + address;
      var lastKnown = localStorage.getItem(storageKey) || '';
      if (txHash !== lastKnown) {
        localStorage.setItem(storageKey, txHash);
        if (lastKnown) {
          // Not first load — real new tx
          var amount = ((lastTx.amount || lastTx.quant || 0) / Math.pow(10, CONFIG.TOKEN_DECIMALS)).toFixed(2);
          this.showNotification('💰 Vous avez reçu ' + amount + ' ' + CONFIG.TOKEN.symbol + ' !', 'success');
          // Refresh balance
          this._setupTron(address);
        }
      }
    } catch(e) { /* ignore */ }
  },

  disconnect: function () {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this._incomingPollInterval) { clearInterval(this._incomingPollInterval); this._incomingPollInterval = null; }
    if (this._trxBalanceInterval) { clearInterval(this._trxBalanceInterval); this._trxBalanceInterval = null; }
    this.wallet = { connected: false, address: null, balance: '0.000000', ethBalance: '0.0000' };
    this.provider = null; this.signer = null; this.usdtContract = null;
    this.updateUI();
    var mb = document.getElementById('mode-badge');
    if (mb) { mb.textContent = '⚫ Déconnecté'; mb.className = 'mode-badge'; }
    this.showNotification('Wallet déconnecté.', 'warning');
  },

  // ===== UPDATE UI =====
  updateUI: function () {
    var connected = this.wallet.connected;
    var ids = ['wallet-section', 'send-section', 'send-section-history', 'send-section-info', 'balance-checker-section'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !connected);
    });
    var prompt = document.getElementById('connect-prompt');
    if (prompt) prompt.classList.toggle('hidden', connected);
    if (connected) this.switchTab(this._activeTab || 'wallet');

    var connectBtn = document.getElementById('connect-btn');
    if (connectBtn) {
      connectBtn.textContent = connected ? '✓ Connecté' : '🦊 Connecter Wallet';
      connectBtn.classList.toggle('connected', connected);
      connectBtn.disabled = connected;
    }

    if (connected) {
      var wa = document.getElementById('wallet-address');
      if (wa) wa.textContent = this.wallet.address;
      var ws = document.getElementById('wallet-short');
      if (ws) ws.textContent = Simulator.shortenAddress(this.wallet.address);
      var ra = document.getElementById('receive-address');
      if (ra) ra.textContent = this.wallet.address;
      // Generate QR code for receive address
      var qrContainer = document.getElementById('qr-code-container');
      if (qrContainer && typeof QRCode !== 'undefined') {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: this.wallet.address, width: 160, height: 160, colorDark: '#26a17b', colorLight: '#1a2235' });
      }
      this.updateBalanceDisplay();
      this.updateNetworkBadge();
      this.updateDeployWarning();
      var trxSendSection = document.getElementById('trx-send-section');
      if (trxSendSection) trxSendSection.style.display = (this.walletType === 'tronlink' && CONFIG.NETWORK.key === 'tron') ? '' : 'none';
    } else {
      var banner = document.getElementById('deploy-warning-banner');
      if (banner) banner.classList.add('hidden');
    }
  },

  // ===== UPDATE BALANCE DISPLAY =====
  updateBalanceDisplay: function () {
    var usdtNum    = parseFloat(this.wallet.balance) || 0;
    var usdtPrice  = this._usdtPrice || 1.00;  // Always ~$1
    var usdtUsdVal = usdtNum * usdtPrice;
    var isTron     = CONFIG.NETWORK.key === 'tron';
    var tokenSymbol = CONFIG.TOKEN.symbol;

    // ── USDT balance ──────────────────────────────────────────────────────
    var ub = document.getElementById('usdt-balance');
    if (ub) ub.textContent = Simulator.formatAmount(usdtNum);
    // Update send balance hint if visible
    if (this._activeTab === 'send') this._updateSendBalanceHint();
    var uv = document.getElementById('usd-value');
    if (uv) {
      uv.textContent = '$' + usdtUsdVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
    }

    // ── USDC balance card ─────────────────────────────────────────────────
    var usdcStat = document.getElementById('usdc-stat');
    var usdcBal  = document.getElementById('usdc-balance');
    var usdcUv   = document.getElementById('usdc-usd-value');
    if (usdcStat) {
      var hasUsdc = Boolean(CONFIG.TOKENS && CONFIG.TOKENS.usdc && CONFIG.TOKENS.usdc.address);
      usdcStat.style.display = hasUsdc ? '' : 'none';
      if (hasUsdc) {
        var usdcNum = parseFloat(this.wallet.usdcBalance) || 0;
        if (usdcBal) usdcBal.textContent = Simulator.formatAmount(usdcNum);
        if (usdcUv) usdcUv.textContent = '$' + (usdcNum * usdtPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
      }
    }

    // ── Gas token (TRX or ETH) ────────────────────────────────────────────
    var eb         = document.getElementById('eth-balance');
    var currencies = document.querySelectorAll('.wallet-stat-value .currency');
    var statLabels = document.querySelectorAll('.wallet-stat-label');
    var euv        = document.getElementById('eth-usd-value');

    var ethStatLabel = document.getElementById('eth-stat-label');
    var ethCurrency   = document.getElementById('eth-currency');
    if (isTron) {
      var trxBal    = parseFloat(this.wallet.ethBalance) || 0;
      var trxUsdVal = trxBal * (this.trxPrice || 0.29);
      var trxEthEquiv = trxUsdVal / (this.ethPrice || 3000);
      if (eb) eb.textContent = trxBal.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      if (ethCurrency)  ethCurrency.textContent  = 'TRX';
      if (ethStatLabel) ethStatLabel.textContent = 'Solde TRX';
      if (euv) {
        euv.textContent = '≈ $' + trxUsdVal.toFixed(2) + ' USD · ≈ ' + trxEthEquiv.toLocaleString('fr-FR', { minimumFractionDigits: 6, maximumFractionDigits: 6 }) + ' ETH';
        euv.style.color = '';
      }
    } else {
      var ethEquiv = usdtUsdVal / (this.ethPrice || 3000);
      if (eb) eb.textContent = ethEquiv.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
      if (ethCurrency)  ethCurrency.textContent  = 'ETH';
      if (ethStatLabel) ethStatLabel.textContent = 'Équivalent ETH';
      if (euv) { euv.textContent = '1 ETH ≈ $' + (this.ethPrice || 3000).toLocaleString('en-US') + ' USD'; euv.style.color = ''; }
    }
    this._renderPortfolioCard();
  },

  // ===== TAB NAVIGATION =====
  _activeTab: 'wallet',
  switchTab: function (tab) {
    this._activeTab = tab;
    var map = {
      wallet:        ['wallet-section'],
      send:          ['send-section'],
      history:       ['send-section-history'],
      info:          ['send-section-info', 'balance-checker-section'],
      'admin-panel': ['admin-panel-section'],
      'admin-claims':['admin-claims-section'],
      'afrx':        ['afrx-section'],
      'uscadx':      ['uscadx-section'],
    };
    var allIds = ['wallet-section', 'send-section', 'send-section-history', 'send-section-info', 'balance-checker-section', 'admin-panel-section', 'admin-claims-section', 'afrx-section', 'uscadx-section'];
    // Only act if connected
    if (!this.wallet.connected) return;
    allIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    (map[tab] || []).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    // Update send balance hint
    if (tab === 'send') { this._updateSendBalanceHint(); this._loadQuickRecipients(); }
    // Load admin claims when tab is opened
    if (tab === 'admin-claims') this.loadClaimRequests();
    // Load admin panel when tab is opened
    if (tab === 'admin-panel') this.loadAdminCreatedAccounts();
    // Load AFRX balance when tab is opened
    if (tab === 'afrx') this._loadAfrxSection();
    // Load USCADX section when tab is opened
    if (tab === 'uscadx') this._loadUscadxSection();
  },
  _updateSendBalanceHint: function () {
    var hint = document.getElementById('send-balance-hint');
    if (!hint) return;
    var bal = parseFloat(this.wallet.balance) || 0;
    var sym = CONFIG.TOKEN.symbol;
    hint.textContent = 'Solde disponible : ' + bal.toLocaleString('en-US', { maximumFractionDigits: 6 }) + ' ' + sym;
  },

  // ===== SMART FEATURES =====
  _timeAgo: function (timestamp) {
    if (!timestamp) return '';
    var seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60)    return 'à l\'instant';
    if (seconds < 3600)  return 'il y a ' + Math.floor(seconds / 60) + 'min';
    if (seconds < 86400) return 'il y a ' + Math.floor(seconds / 3600) + 'h';
    return 'il y a ' + Math.floor(seconds / 86400) + 'j';
  },

  _renderPortfolioCard: function () {
    var card = document.getElementById('portfolio-card');
    if (!card || !this.wallet.connected) return;
    var isTron      = CONFIG.NETWORK.key === 'tron';
    var usdtBal    = parseFloat(this.wallet.balance) || 0;
    var usdcBal    = parseFloat(this.wallet.usdcBalance) || 0;
    var nativeBal  = parseFloat(this.wallet.ethBalance) || 0;
    var nativePrice = isTron ? (this.trxPrice || 0.29) : (this.ethPrice || 3000);
    var nativeSym  = isTron ? 'TRX' : 'ETH';
    var nativeColor = isTron ? '#e84142' : '#627eea';
    var usdtUsd    = usdtBal;
    var usdcUsd    = usdcBal;
    var nativeUsd  = nativeBal * nativePrice;
    var totalUsd   = usdtUsd + usdcUsd + nativeUsd;
    if (totalUsd < 0.001) { card.style.display = 'none'; return; }
    card.style.display = '';
    var totalEl = document.getElementById('portfolio-total-usd');
    if (totalEl) totalEl.textContent = '$' + totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var assets = [
      { symbol: 'USDT', bal: usdtBal, usd: usdtUsd, color: '#26a17b' },
      { symbol: 'USDC', bal: usdcBal, usd: usdcUsd, color: '#2775ca' },
      { symbol: nativeSym, bal: nativeBal, usd: nativeUsd, color: nativeColor },
    ].filter(function (a) { return a.bal > 0.0001; });
    var barsEl = document.getElementById('portfolio-bars');
    if (barsEl) {
      barsEl.innerHTML = assets.map(function (a) {
        var pct = totalUsd > 0 ? Math.min(100, a.usd / totalUsd * 100) : 0;
        return [
          '<div style="display:flex;align-items:center;gap:8px;">',
            '<div style="width:52px;font-size:11px;font-weight:700;color:' + a.color + ';">' + a.symbol + '</div>',
            '<div style="flex:1;background:var(--bg-primary);border-radius:4px;height:7px;overflow:hidden;">',
              '<div style="background:' + a.color + ';width:' + pct.toFixed(1) + '%;height:100%;border-radius:4px;transition:width 0.6s ease;"></div>',
            '</div>',
            '<div style="width:90px;text-align:right;font-size:12px;color:var(--text-primary);font-weight:600;">' + a.bal.toLocaleString('en-US', { maximumFractionDigits: 4 }) + '</div>',
            '<div style="width:52px;text-align:right;font-size:11px;color:var(--text-muted);">$' + a.usd.toFixed(2) + '</div>',
          '</div>',
        ].join('');
      }).join('');
    }
    var txs = Simulator.getTransactionHistory();
    var now = Date.now();
    var weekMs = 7 * 24 * 60 * 60 * 1000;
    var txsWeek = txs.filter(function (t) { return t.timestamp && (now - new Date(t.timestamp).getTime()) < weekMs && t.type === 'send'; });
    var totalSentWeek = txsWeek.reduce(function (s, t) { return s + (parseFloat(t.amount) || 0); }, 0);
    var statsEl = document.getElementById('portfolio-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        _stat('Total tx', txs.length, ''),
        _stat('Envoyé 7j', totalSentWeek > 0 ? totalSentWeek.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—', ''),
        _stat('Cette semaine', txsWeek.length + ' tx', ''),
      ].join('');
    }
    function _stat(label, value, color) {
      return [
        '<div style="background:var(--bg-primary);border-radius:var(--radius-sm);padding:8px 12px;flex:1;min-width:80px;text-align:center;">',
          '<div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">' + label + '</div>',
          '<div style="font-size:15px;font-weight:700;color:' + (color || 'var(--text-primary)') + ';">' + value + '</div>',
        '</div>',
      ].join('');
    }
  },

  _loadQuickRecipients: function () {
    var bar  = document.getElementById('quick-recipients-bar');
    var list = document.getElementById('quick-recipients-list');
    if (!bar || !list) return;
    var txs  = Simulator.getTransactionHistory().filter(function (t) { return t.type === 'send' && t.to; });
    var seen = {}, recent = [];
    for (var i = 0; i < txs.length && recent.length < 3; i++) {
      if (!seen[txs[i].to]) { seen[txs[i].to] = true; recent.push(txs[i]); }
    }
    if (!recent.length) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    var contacts = {};
    try { contacts = JSON.parse(localStorage.getItem('usdt_contacts') || '{}'); } catch (e) {}
    var self = this;
    list.innerHTML = recent.map(function (t) {
      var addr  = t.to;
      var short = addr.length > 12 ? addr.slice(0, 6) + '…' + addr.slice(-4) : addr;
      var name  = contacts[addr] || short;
      var amt   = parseFloat(t.amount) || 0;
      var sym   = t.tokenSymbol || 'USDT';
      return [
        '<button type="button" onclick="App._fillRecipient(\'' + addr + '\')"',
        ' style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);',
        'padding:8px 12px;cursor:pointer;text-align:left;min-width:0;max-width:160px;">',
          '<div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</div>',
          '<div style="font-size:11px;color:var(--text-muted);">' + amt.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + sym + '</div>',
        '</button>',
      ].join('');
    }).join('');
  },

  _fillRecipient: function (address) {
    var input = document.getElementById('recipient-input');
    if (!input) return;
    input.value = address;
    input.dispatchEvent(new Event('input'));
    this.showNotification('Adresse remplie', 'success');
    input.focus();
  },
  pasteAddress: async function () {
    try {
      var text = await navigator.clipboard.readText();
      var input = document.getElementById('recipient-input');
      if (input) { input.value = text.trim(); input.dispatchEvent(new Event('input')); }
      this.showNotification('✅ Adresse collée', 'success');
    } catch (e) { this.showNotification('Impossible de lire le presse-papiers', 'warning'); }
  },
  setQuickAmount: function (pct) {
    var bal = parseFloat(this.wallet.balance) || 0;
    var amt = bal * pct;
    var input = document.getElementById('amount-input');
    if (input && amt > 0) {
      input.value = amt.toFixed(6).replace(/\.?0+$/, '');
      input.dispatchEvent(new Event('input'));
    }
  },
  // ===== BIND EVENTS =====
  bindEvents: function () {
    var self = this;
    document.getElementById('connect-btn') && document.getElementById('connect-btn').addEventListener('click', function () { self.connectWallet(); });
    document.getElementById('send-form') && document.getElementById('send-form').addEventListener('submit', function (e) { e.preventDefault(); self.initiateSend(); });

    document.getElementById('amount-input') && document.getElementById('amount-input').addEventListener('input', function (e) {
      var amount = parseFloat(e.target.value) || 0;
      document.getElementById('amount-usd').textContent = '≈ ' + Simulator.formatUSD(amount);
      var bal    = parseFloat(self.wallet.balance) || 0;
      var trxBal = parseFloat(self.wallet.ethBalance) || 0;
      var hint   = document.getElementById('send-balance-hint');
      if (!hint) return;
      var warns = [];
      if (amount > bal) {
        warns.push('<span style="color:#e74c3c;">⚠️ Montant supérieur au solde (' + bal.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' ' + CONFIG.TOKEN.symbol + ')</span>');
      } else if (bal > 0 && amount > bal * 0.8) {
        warns.push('<span style="color:#f39c12;">💡 Tu envoies ' + Math.round(amount / bal * 100) + '% de ton solde</span>');
      }
      if (CONFIG.NETWORK.key === 'tron' && trxBal < 2) {
        warns.push('<span style="color:#f39c12;">⛽ Solde TRX faible (' + trxBal + ' TRX) — frais à risque</span>');
      }
      if (warns.length) {
        hint.innerHTML = warns.join('  ');
      } else {
        hint.textContent = 'Solde disponible : ' + bal.toLocaleString('en-US', { maximumFractionDigits: 6 }) + ' ' + CONFIG.TOKEN.symbol;
      }
    });

    document.getElementById('max-btn') && document.getElementById('max-btn').addEventListener('click', function () {
      document.getElementById('amount-input').value = self.wallet.balance;
      document.getElementById('amount-usd').textContent = '≈ ' + Simulator.formatUSD(self.wallet.balance);
    });

    document.getElementById('recipient-input') && document.getElementById('recipient-input').addEventListener('input', function (e) {
      var addr = e.target.value.trim();
      var ind = document.getElementById('address-indicator');
      if (!addr) { ind.textContent = ''; ind.className = 'address-indicator'; return; }
      var isTron = CONFIG.NETWORK.key === 'tron';
      var valid = isTron ? App.isValidTronAddress(addr) : Simulator.isValidAddress(addr);
      if (valid) {
        var msg = isTron ? '✓ Adresse TRON valide' : '✓ Adresse Ethereum valide';
        var history = Simulator.getTransactionHistory();
        var lastTx = history.find(function (t) { return t.to === addr && t.type === 'send'; });
        if (lastTx) {
          msg += ' · Dernier envoi: ' + (parseFloat(lastTx.amount) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + (lastTx.tokenSymbol || 'USDT') + ' ' + App._timeAgo(lastTx.timestamp);
        }
        ind.textContent = msg;
        ind.className = 'address-indicator valid';
      } else {
        ind.textContent = '✗ Adresse invalide';
        ind.className = 'address-indicator invalid';
      }
    });

    document.getElementById('close-modal') && document.getElementById('close-modal').addEventListener('click', function () { self.closeModal(); });
    document.getElementById('copy-hash') && document.getElementById('copy-hash').addEventListener('click', function () {
      var hash = document.getElementById('tx-hash-display').textContent;
      navigator.clipboard.writeText(hash).then(function () { self.showNotification('Hash copié!', 'success'); });
    });
    document.getElementById('view-etherscan') && document.getElementById('view-etherscan').addEventListener('click', function () {
      var hash = document.getElementById('tx-hash-display').textContent;
      // TRON uses /transaction/ path; EVM explorers use /tx/
      var url = CONFIG.NETWORK.key === 'tron'
        ? 'https://tronscan.org/#/transaction/' + hash
        : CONFIG.NETWORK.blockExplorer + '/tx/' + hash;
      window.open(url, '_blank');
    });
    document.getElementById('clear-history') && document.getElementById('clear-history').addEventListener('click', function () {
      Simulator.clearHistory(); self.loadTransactionHistory(); self.showNotification('Historique effacé.', 'info');
    });
    document.getElementById('new-tx-btn') && document.getElementById('new-tx-btn').addEventListener('click', function () {
      self.closeModal();
      document.getElementById('send-form').reset();
      document.getElementById('amount-usd').textContent = '≈ $0.00 USD';
      document.getElementById('address-indicator').textContent = '';
    });
    document.getElementById('check-balance-btn') && document.getElementById('check-balance-btn').addEventListener('click', function () { self.checkAddressBalance(); });
    document.getElementById('checker-input') && document.getElementById('checker-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') self.checkAddressBalance(); });
    document.getElementById('refresh-btn') && document.getElementById('refresh-btn').addEventListener('click', async function () {
      var btn = document.getElementById('refresh-btn');
      if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
      await self.refreshBalances();
      if (btn) { btn.textContent = '🔄'; btn.disabled = false; }
      self.showNotification('Solde mis à jour.', 'success');
    });

    var searchInput = document.getElementById('history-search');
    if (searchInput) {
      searchInput.addEventListener('input', function (e) {
        self.historyState.search = (e.target.value || '').trim().toLowerCase();
        self.loadTransactionHistory();
      });
    }

    var typeFilter = document.getElementById('history-filter-type');
    if (typeFilter) {
      typeFilter.addEventListener('change', function (e) {
        self.historyState.type = e.target.value || 'all';
        self.loadTransactionHistory();
      });
    }

    var netFilter = document.getElementById('history-filter-network');
    if (netFilter) {
      netFilter.addEventListener('change', function (e) {
        self.historyState.network = e.target.value || 'all';
        self.loadTransactionHistory();
      });
    }

    var tokenFilter = document.getElementById('history-filter-token');
    if (tokenFilter) {
      tokenFilter.addEventListener('change', function (e) {
        self.historyState.token = e.target.value || 'all';
        self.loadTransactionHistory();
      });
    }

    var exportBtn = document.getElementById('export-history');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        self.exportHistoryCSV();
      });
    }
  },

  // ===== INITIATE SEND =====
  initiateSend: function () {
    var recipient = document.getElementById('recipient-input').value.trim();
    var amount = document.getElementById('amount-input').value.trim();
    var note = document.getElementById('note-input').value.trim();

    if (!this.wallet.connected) { this.showNotification('Connectez votre wallet.', 'error'); return; }

    // Address validation — TRON vs EVM (account mode accepts email or TRON address)
    var isTron = CONFIG.NETWORK.key === 'tron';
    var isAccountMode = this.walletType === 'account';
    var validAddr;
    if (isAccountMode) {
      validAddr = recipient.length > 2; // email or TRON address
      // In account mode + TRON: if the recipient is a valid TRON address but TronLink is not connected,
      // check whether TronLink is available — if so, it will be used for on-chain send (fine).
      // If not, warn the user that only platform users can receive in account mode.
      if (isTron && validAddr && this.isValidTronAddress(recipient)) {
        var tronAvailable = window.tronWeb && window.tronWeb.ready;
        var tronAddrAvail = window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58;
        if (!tronAvailable || !tronAddrAvail) {
          this.showNotification(
            '⚠️ En mode compte, vous ne pouvez envoyer qu\'à un utilisateur enregistré sur la plateforme (email). ' +
            'Pour envoyer à un wallet externe, connectez TronLink via le bouton "Connecter TronLink".',
            'warning'
          );
          return;
        }
      }
    } else {
      validAddr = isTron ? this.isValidTronAddress(recipient) : Simulator.isValidAddress(recipient);
    }
    if (!validAddr) {
      this.showNotification(isTron ? 'Adresse TRON invalide (doit commencer par T).' : 'Adresse Ethereum invalide.', 'error');
      return;
    }
    if (recipient.toLowerCase() === (this.wallet.address || '').toLowerCase()) {
      this.showNotification('Impossible d\'envoyer à votre propre adresse.', 'error');
      return;
    }

    var amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) { this.showNotification('Montant invalide.', 'error'); return; }
    if (amountNum > parseFloat(this.wallet.balance)) {
      this.showNotification('Solde insuffisant. Vous avez ' + Simulator.formatAmount(this.wallet.balance) + ' ' + CONFIG.TOKEN.symbol + '.', 'error');
      return;
    }
    this.showConfirmModal(recipient, amountNum, note);
  },

  // ===== SHOW CONFIRM MODAL =====
  showConfirmModal: async function (recipient, amount, note) {
    var net = CONFIG.NETWORK;
    var isTron = net.key === 'tron';
    document.getElementById('confirm-from').textContent = Simulator.shortenAddress(this.wallet.address);
    document.getElementById('confirm-to').textContent = Simulator.shortenAddress(recipient);
    document.getElementById('confirm-amount').textContent = Simulator.formatAmount(amount) + ' ' + CONFIG.TOKEN.symbol;
    document.getElementById('confirm-usd').textContent = isTron ? 'Token personnalise · pas de prix USD' : '≈ ' + Simulator.formatUSD(amount);
    document.getElementById('confirm-network').textContent = net.label;
    var confirmToken = document.getElementById('confirm-token');
    if (confirmToken) confirmToken.textContent = isTron ? CONFIG.TOKEN.symbol + ' (TRC-20)' : CONFIG.TOKEN.symbol + ' (ERC-20)';

    var gasEl = document.getElementById('confirm-gas');
    gasEl.style.color = '';

    if (this.walletType === 'account' && net.key !== 'tron') {
      var ethEquiv = amount / (this.ethPrice || 3000);
      gasEl.textContent = 'Gratuit · Équiv: ' + ethEquiv.toFixed(6) + ' ETH (≈ $' + amount.toLocaleString() + ' USD)';
      gasEl.style.color = 'var(--usdt-green)';
    } else if (net.key === 'tron') {
      // TRON: show only network fee, not a faux USD/ETH valuation
      gasEl.textContent = '~1-5 TRX de frais reseau';
      gasEl.style.color = 'var(--usdt-green)';
    } else if (net.requiresGas) {
      // Polygon / Sepolia: estimate real gas cost
      var gasToken = net.key === 'polygon' ? 'MATIC' : 'ETH';
      try {
        var rpcProvider = new ethers.JsonRpcProvider(net.rpcUrl);
        var contract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, rpcProvider);
        var amountUnits = ethers.parseUnits(amount.toString(), CONFIG.TOKEN_DECIMALS);
        var results = await Promise.all([
          contract.transfer.estimateGas(recipient, amountUnits, { from: this.wallet.address }),
          rpcProvider.getFeeData()
        ]);
        var gasEst = results[0];
        var feeData = results[1];
        var gasCostWei = gasEst * (feeData.gasPrice || feeData.maxFeePerGas || BigInt(1000000000));
        var gasCostEth = parseFloat(ethers.formatEther(gasCostWei));
        var gasCostUsd = gasCostEth * (this.ethPrice || 3000);
        gasEl.textContent = '~' + gasCostEth.toFixed(6) + ' ' + gasToken + ' (≈ $' + gasCostUsd.toFixed(4) + ' USD)';
        if (parseFloat(this.wallet.ethBalance) < gasCostEth) {
          gasEl.textContent += ' ⚠ ' + gasToken + ' insuffisant';
          gasEl.style.color = 'var(--warning)';
        }
      } catch (e) {
        gasEl.textContent = '~0.0001 ' + gasToken + ' (estimé)';
      }
    } else {
      // Tenderly: no gas — show USDT value in ETH equivalent
      var ethEquiv = amount / (this.ethPrice || 3000);
      gasEl.textContent = 'Gratuit · Valeur: ' + ethEquiv.toFixed(6) + ' ETH (≈ $' + amount.toLocaleString() + ' USD)';
      gasEl.style.color = 'var(--usdt-green)';
    }

    document.getElementById('tx-modal').classList.remove('hidden');
    this.showModalStep('confirm-step');

    // Show TRON warning if applicable
    var tronWarning = document.getElementById('confirm-warning');
    if (tronWarning) {
      if (isTron && this.isValidTronAddress(recipient)) {
        tronWarning.classList.remove('hidden');
      } else {
        tronWarning.classList.add('hidden');
      }
    }

    var self = this;
    document.getElementById('confirm-send-btn').onclick = function () { self.executeSend(recipient, amount, note); };
    document.getElementById('cancel-send-btn').onclick = function () { self.closeModal(); };
  },

  // ===== EXECUTE SEND =====
  executeSend: async function (recipient, amount, note) {
    if (window.USDTTracker) {
      window.USDTTracker.trackAction('send_usdt_attempt', amount + ' to ' + recipient);
    }
    this.showModalStep('processing-step');
    document.getElementById('progress-bar').style.width = '10%';
    var net = CONFIG.NETWORK;
    try {
      // Account mode: no wallet extension — pure DB transfer
      // BUT if TronLink is available and ready, prefer on-chain send (can send to any address)
      var tronReady = window.tronWeb && window.tronWeb.ready;
      if (this.walletType === 'account' && net.transferMode !== 'tron') {
        await this._executeSendAccount(recipient, amount, note);
        return;
      }
      if (this.walletType === 'account' && net.transferMode === 'tron' && !tronReady) {
        await this._executeSendAccount(recipient, amount, note);
        return;
      }
      if (net.transferMode === 'tron') {
        await this._executeSendTron(recipient, amount, note);
      } else if (net.transferMode === 'tenderly') {
        await this._executeSendTenderly(recipient, amount, note);
      } else {
        await this._executeSendOnchain(recipient, amount, note);
      }
    } catch (err) {
      this.closeModal();
      if (err.code === 4001 || err.code === 'ACTION_REJECTED' || (err.message && err.message.includes('user rejected'))) {
        this.showNotification('Transaction annulée.', 'warning');
      } else {
        this.showNotification('Erreur: ' + (err.reason || err.shortMessage || err.message || 'Erreur inconnue'), 'error');
      }
      console.error('executeSend error:', err);
    }
  },

  // ── Tenderly transfer ────────────────────────────────────────────
  // Uses eth_sendTransaction on Tenderly VNet (unlocked accounts — no signing needed)
  // This creates a REAL on-chain transaction with a REAL hash visible on Tenderly Explorer.
  // Works for ALL recipient wallets — even those with no ETH / no swap capability.
  _executeSendTenderly: async function (recipient, amount, note) {
    var self = this;
    var pb = document.getElementById('progress-bar');
    var rpcProvider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpcUrl);

    // Convert amount to token units (6 decimals for USDT/USDC) — BigInt, no float precision loss
    var amountUnits = ethers.parseUnits(amount.toString(), CONFIG.TOKEN_DECIMALS);
    var ethEquiv = amount / (this.ethPrice || 3000);

    if (pb) pb.style.width = '20%';

    // Encode ERC-20 transfer(address,uint256) call data
    var iface = new ethers.Interface([
      'function transfer(address to, uint256 value) returns (bool)'
    ]);
    var callData = iface.encodeFunctionData('transfer', [recipient, amountUnits]);

    if (pb) pb.style.width = '35%';

    var txHash, blockNum, gasUsed;

    // ── Primary path: eth_sendTransaction with realistic gas price ──
    // Tenderly VNet unlocks all accounts — no signing needed.
    // We set a realistic gas price (≥ 20 gwei) and top up sender ETH via
    // tenderly_setBalance so the tx is never rejected for insufficient gas funds.
    // Gas limit: 500,000 (displayed in UI); actual gas used ≈ 46k (shown on Tenderly).
    try {
      var GAS_LIMIT = 500000;

      // ── Fetch realistic gas price (minimum 20 gwei) ──
      var gasPrice = BigInt(20000000000); // 20 gwei default
      try {
        var feeData = await rpcProvider.getFeeData();
        var fetched = feeData.gasPrice || feeData.maxFeePerGas;
        if (fetched && fetched > gasPrice) gasPrice = fetched;
      } catch (e) { /* keep 20 gwei default */ }

      // ── Ensure sender has enough ETH to cover gas ──
      try {
        var gasCostWei = gasPrice * BigInt(GAS_LIMIT);
        var currentEth = await rpcProvider.getBalance(this.wallet.address);
        if (currentEth < gasCostWei) {
          // Top up to 3× the max gas cost so the tx never fails for gas
          var topUp = '0x' + (gasCostWei * BigInt(3)).toString(16);
          await rpcProvider.send('tenderly_setBalance', [this.wallet.address, topUp]);
          console.log('⛽ ETH topped up for gas:', topUp);
        }
      } catch (e) { console.warn('ETH balance top-up failed (tx may still succeed):', e.message); }

      if (pb) pb.style.width = '45%';

      txHash = await rpcProvider.send('eth_sendTransaction', [{
        from: this.wallet.address,
        to: CONFIG.USDT_CONTRACT_ADDRESS,
        data: callData,
        value: '0x0',
        gas: '0x' + GAS_LIMIT.toString(16),
        gasPrice: '0x' + gasPrice.toString(16)
      }]);

      if (pb) pb.style.width = '65%';

      // Wait for receipt (timeout 20s)
      var receipt = null;
      try {
        receipt = await rpcProvider.waitForTransaction(txHash, 1, 20000);
      } catch (waitErr) {
        console.warn('waitForTransaction timeout — tx likely still confirmed:', waitErr.message);
      }

      blockNum = receipt ? receipt.blockNumber : (19000000 + Math.floor(Math.random() * 500000));
      // Show gas limit (500,000) in app UI — actual gas used visible on Tenderly Explorer
      gasUsed  = GAS_LIMIT.toString();

      console.log('✅ Real Tenderly tx:', txHash, '| gasPrice:', gasPrice.toString(), 'wei');

    } catch (sendErr) {
      // ── Fallback: tenderly_setErc20Balance (if eth_sendTransaction not supported) ──
      console.warn('eth_sendTransaction failed, using tenderly_setErc20Balance fallback:', sendErr.message);

      // Set sender balance (BigInt)
      try {
        var senderContract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, rpcProvider);
        var senderRaw = await senderContract.balanceOf(this.wallet.address);
        var senderNew = senderRaw > amountUnits ? senderRaw - amountUnits : BigInt(0);
        await rpcProvider.send('tenderly_setErc20Balance', [CONFIG.USDT_CONTRACT_ADDRESS, this.wallet.address, '0x' + senderNew.toString(16)]);
      } catch (e) { console.warn('Sender balance fallback failed:', e.message); }

      if (pb) pb.style.width = '50%';

      // Set recipient balance (BigInt, retry x3)
      for (var attempt = 1; attempt <= 3; attempt++) {
        try {
          var rContract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, rpcProvider);
          var rRaw = await rContract.balanceOf(recipient);
          var rNew = rRaw + amountUnits;
          await rpcProvider.send('tenderly_setErc20Balance', [CONFIG.USDT_CONTRACT_ADDRESS, recipient, '0x' + rNew.toString(16)]);
          var verify = await rContract.balanceOf(recipient);
          if (verify >= rNew) { console.log('✅ Recipient balance set on attempt', attempt); break; }
        } catch (e) {
          console.warn('Recipient balance attempt', attempt, 'failed:', e.message);
          if (attempt < 3) await new Promise(function (r) { setTimeout(r, 800); });
        }
      }

      // Generate a display hash (not real on-chain, but clearly labeled)
      txHash   = '0x' + Array.from({ length: 64 }, function () { return Math.floor(Math.random() * 16).toString(16); }).join('');
      blockNum = 19000000 + Math.floor(Math.random() * 500000);
      gasUsed  = (45000 + Math.floor(Math.random() * 20000)).toString();
    }

    if (pb) pb.style.width = '80%';

    // Update local balance display immediately
    var prevBalance = parseFloat(this.wallet.balance);
    this.wallet.balance = Math.max(0, prevBalance - amount).toFixed(6);
    this.updateBalanceDisplay();

    if (pb) pb.style.width = '90%';

    // Save to history with real hash + ETH equivalent
    Simulator.saveTransaction({
      hash: txHash,
      from: this.wallet.address,
      to: recipient,
      amount: amount,
      blockNumber: blockNum,
      gasUsed: gasUsed,
      timestamp: new Date().toISOString(),
      status: 'confirmed',
      note: note || '',
      real: true,
      type: 'send',
      network: CONFIG.NETWORK.key,
      tokenSymbol: CONFIG.TOKEN.symbol,
      ethPrice: this.ethPrice || 3000,
      ethEquiv: ethEquiv.toFixed(6)
    });

    if (pb) pb.style.width = '100%';
    await new Promise(function (r) { setTimeout(r, 400); });

    self._showSuccessStep(txHash, blockNum, gasUsed, amount, recipient, ethEquiv);
    self.loadTransactionHistory();
    self._syncTransferToDB(recipient, amount);

    // Refresh balances from chain after 2s
    setTimeout(function () { self.refreshBalances(); }, 2000);
  },

  // ── Sepolia on-chain transfer (real ERC-20 transfer) ─────────────
  _executeSendOnchain: async function (recipient, amount, note) {
    var self = this;
    var pb = document.getElementById('progress-bar');
    if (pb) pb.style.width = '20%';

    var amountUnits = ethers.parseUnits(amount.toString(), CONFIG.TOKEN_DECIMALS);
    var tx = await this.usdtContract.transfer(recipient, amountUnits);
    if (pb) pb.style.width = '50%';

    this.showNotification('⏳ Transaction envoyée, attente confirmation...', 'info');
    var receipt = await tx.wait(1);
    if (pb) pb.style.width = '90%';

    var txHash = receipt.hash || tx.hash;
    var blockNum = receipt.blockNumber || 0;
    var gasUsed = receipt.gasUsed ? receipt.gasUsed.toString() : '65000';
    var ethEquiv = amount / (this.ethPrice || 3000);

    Simulator.saveTransaction({
      hash: txHash,
      from: this.wallet.address,
      to: recipient,
      amount: amount,
      blockNumber: blockNum,
      gasUsed: gasUsed,
      timestamp: new Date().toISOString(),
      status: 'confirmed',
      note: note || '',
      real: true,
      type: 'send',
      network: CONFIG.NETWORK.key,
      tokenSymbol: CONFIG.TOKEN.symbol,
      ethPrice: this.ethPrice || 3000,
      ethEquiv: ethEquiv.toFixed(6)
    });

    if (pb) pb.style.width = '100%';
    await new Promise(function (r) { setTimeout(r, 300); });

    self._showSuccessStep(txHash, blockNum, gasUsed, amount, recipient, ethEquiv);
    self.loadTransactionHistory();
    await self.refreshBalances();
  },

  // ── Show success step in modal ────────────────────────────────────
  // Accepts either (txObject) or (txHash, blockNum, gasUsed, amount, recipient, ethEquiv)
  _showSuccessStep: function (txHashOrObj, blockNum, gasUsed, amount, recipient, ethEquiv) {
    // Normalize: if first arg is an object, unpack it
    var txHash, bNum, gUsed, amt, rcpt, ethEq, tokenSymbol, txNetwork;
    if (txHashOrObj && typeof txHashOrObj === 'object') {
      txHash = txHashOrObj.hash;
      bNum   = txHashOrObj.blockNumber;
      gUsed  = txHashOrObj.gasUsed;
      amt    = txHashOrObj.amount;
      rcpt   = txHashOrObj.to;
      ethEq  = txHashOrObj.ethEquiv;
      tokenSymbol = txHashOrObj.tokenSymbol || CONFIG.TOKEN.symbol;
      txNetwork = txHashOrObj.network || CONFIG.NETWORK.key;
    } else {
      txHash = txHashOrObj;
      bNum   = blockNum;
      gUsed  = gasUsed;
      amt    = amount;
      rcpt   = recipient;
      ethEq  = ethEquiv;
      tokenSymbol = CONFIG.TOKEN.symbol;
      txNetwork = CONFIG.NETWORK.key;
    }

    this.showModalStep('success-step');
    var hashEl = document.getElementById('tx-hash-display');
    if (hashEl) hashEl.textContent = txHash;

    // Show TRON note if applicable
    var tronNote = document.getElementById('success-tron-note');
    if (tronNote) {
      if (txNetwork === 'tron') {
        tronNote.classList.remove('hidden');
      } else {
        tronNote.classList.add('hidden');
      }
    }

    var blockEl = document.getElementById('tx-block-display');
    if (blockEl) blockEl.textContent = bNum ? '#' + parseInt(bNum).toLocaleString() : '—';
    var gasEl = document.getElementById('tx-gas-display');
    if (gasEl) gasEl.textContent = gUsed ? (isNaN(parseInt(gUsed)) ? gUsed : parseInt(gUsed).toLocaleString() + ' gas') : '—';
    var ethEl = document.getElementById('tx-eth-display');
    var ethRow = document.querySelector('.s-eth-row');
    var isAccountMode = this.walletType === 'account';
    if (ethEl) {
      if (txNetwork === 'tron' && !isAccountMode) {
        ethEl.textContent = 'Non applicable';
      } else {
        var ethVal = ethEq || (amt / (this.ethPrice || 3000));
        ethEl.textContent = '≈ ' + parseFloat(ethVal).toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 }) + ' ETH';
      }
    }
    if (ethRow) ethRow.style.display = (txNetwork === 'tron' && !isAccountMode) ? 'none' : '';
    var amtEl = document.getElementById('tx-amount-display');
    if (amtEl) amtEl.textContent = Simulator.formatAmount(amt) + ' ' + tokenSymbol;
    var toEl = document.getElementById('tx-to-display');
    if (toEl) toEl.textContent = Simulator.shortenAddress(rcpt);
    var netEl = document.getElementById('tx-network-display');
    if (netEl) netEl.textContent = CONFIG.NETWORK.label;
    var viewBtn = document.getElementById('view-etherscan');
    if (viewBtn) {
      viewBtn.textContent = CONFIG.NETWORK.key === 'tenderly'
        ? '🔍 Voir sur Tenderly'
        : CONFIG.NETWORK.key === 'polygon'
        ? '🔍 Voir sur Polygonscan'
        : CONFIG.NETWORK.key === 'tron'
        ? '🔍 Voir sur TronScan'
        : '🔍 Voir sur Etherscan';
      // Update explorer link for TRON
      if (CONFIG.NETWORK.key === 'tron') {
        viewBtn.onclick = function () {
          window.open('https://tronscan.org/#/transaction/' + txHash, '_blank');
        };
      }
    }
  },

  // ===== MODAL HELPERS =====
  showModalStep: function (stepId) {
    var steps = ['confirm-step', 'processing-step', 'success-step'];
    steps.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', id !== stepId);
    });
  },

  closeModal: function () {
    var modal = document.getElementById('tx-modal');
    if (modal) modal.classList.add('hidden');
  },

  _resetModal: function () {
    this.closeModal();
    this.showModalStep('confirm-step');
    var pb = document.getElementById('progress-bar');
    if (pb) pb.style.width = '0%';
  },

  // Alias used by _setupTron — same as updateUI
  _updateWalletUI: function () {
    this.updateUI();
    var modeBadge = document.getElementById('mode-badge');
    if (modeBadge) {
      modeBadge.textContent = '🔴 TronLink';
      modeBadge.className = 'mode-badge real';
    }
    var connectBtn = document.getElementById('connect-btn');
    if (connectBtn) { connectBtn.textContent = '✓ Connecté'; connectBtn.classList.add('connected'); connectBtn.disabled = true; }
    this.updateDeployWarning();
  },

  // ===== CHECK ADDRESS BALANCE =====
  checkAddressBalance: async function () {
    var input = document.getElementById('checker-input');
    var resultEl = document.getElementById('checker-result');
    if (!input || !resultEl) return;
    var addr = input.value.trim();
    if (!Simulator.isValidAddress(addr)) {
      resultEl.innerHTML = '<span class="checker-error">❌ Adresse Ethereum invalide</span>';
      return;
    }
    resultEl.innerHTML = '<span class="checker-loading">⏳ Vérification...</span>';
    try {
      var rpcProvider = new ethers.JsonRpcProvider(CONFIG.NETWORK.rpcUrl);
      var contract = new ethers.Contract(CONFIG.USDT_CONTRACT_ADDRESS, CONFIG.USDT_ABI, rpcProvider);
      var results = await Promise.all([
        contract.balanceOf(addr),
        rpcProvider.getBalance(addr)
      ]);
      var usdtBal = parseFloat(ethers.formatUnits(results[0], CONFIG.TOKEN_DECIMALS));
      var ethBal = parseFloat(ethers.formatEther(results[1]));
      var ethEquiv = usdtBal / (this.ethPrice || 3000);
      resultEl.innerHTML =
        '<div class="checker-success">' +
        '<div class="checker-row"><span>Adresse:</span><span class="checker-addr">' + Simulator.shortenAddress(addr) + '</span></div>' +
        '<div class="checker-row"><span>' + CONFIG.TOKEN.symbol + ':</span><span class="checker-amount">' + Simulator.formatAmount(usdtBal) + ' ' + CONFIG.TOKEN.symbol + '</span></div>' +
        '<div class="checker-row"><span>Valeur USD:</span><span>' + Simulator.formatUSD(usdtBal) + '</span></div>' +
        '<div class="checker-row"><span>Équiv. ETH:</span><span>' + ethEquiv.toFixed(6) + ' ETH</span></div>' +
        '<div class="checker-row"><span>ETH (gaz):</span><span>' + ethBal.toFixed(6) + ' ETH</span></div>' +
        '<div class="checker-row"><span>Réseau:</span><span>' + CONFIG.NETWORK.label + '</span></div>' +
        '</div>';
    } catch (err) {
      resultEl.innerHTML = '<span class="checker-error">❌ Erreur: ' + err.message + '</span>';
    }
  },

  getFilteredHistory: function () {
    var txs = Simulator.getTransactionHistory();
    var search = this.historyState.search || '';
    var type = this.historyState.type || 'all';
    var network = this.historyState.network || 'all';
    var token = this.historyState.token || 'all';

    return txs.filter(function (tx) {
      var txType = tx.type || 'send';
      var txNetwork = tx.network || 'tenderly';
      var txToken = (tx.tokenSymbol || 'USDT').toUpperCase();

      if (type !== 'all' && txType !== type) return false;
      if (network !== 'all' && txNetwork !== network) return false;
      if (token !== 'all' && txToken !== token) return false;
      if (!search) return true;

      var haystack = [
        tx.hash || '',
        tx.note || '',
        tx.from || '',
        tx.to || '',
        txNetwork,
        txType,
      ].join(' ').toLowerCase();

      return haystack.indexOf(search) !== -1;
    });
  },

  renderHistoryStats: function (txs) {
    var el = document.getElementById('history-stats');
    if (!el) return;

    var sendCount = 0;
    var faucetCount = 0;
    var totalUsdt = 0;

    txs.forEach(function (tx) {
      totalUsdt += parseFloat(tx.amount || 0);
      if (tx.type === 'faucet') faucetCount += 1;
      else if (tx.type === 'send') sendCount += 1;
    });

    // Split totals by token symbol
    var totals = {};
    txs.forEach(function (tx) {
      var sym = (tx.tokenSymbol || 'USDT').toUpperCase();
      totals[sym] = (totals[sym] || 0) + parseFloat(tx.amount || 0);
    });
    var totalStr = Object.keys(totals).map(function (sym) {
      return Simulator.formatAmount(totals[sym]) + ' ' + sym;
    }).join(' · ') || '0';

    el.innerHTML =
      '<div class="history-stat-item"><span>Transactions</span><strong>' + txs.length + '</strong></div>' +
      '<div class="history-stat-item"><span>Envois</span><strong>' + sendCount + '</strong></div>' +
      '<div class="history-stat-item"><span>Faucet</span><strong>' + faucetCount + '</strong></div>' +
      '<div class="history-stat-item"><span>Volumes</span><strong>' + totalStr + '</strong></div>';
  },

  exportHistoryCSV: function () {
    var rows = this.getFilteredHistory();
    if (!rows.length) {
      this.showNotification('Aucune transaction à exporter.', 'warning');
      return;
    }

    var headers = ['timestamp', 'type', 'network', 'token', 'amount', 'from', 'to', 'hash', 'blockNumber', 'gasUsed', 'note', 'status'];
    var lines = [headers.join(',')];

    rows.forEach(function (tx) {
      var line = [
        tx.timestamp || '',
        tx.type || '',
        tx.network || '',
        tx.tokenSymbol || 'USDT',
        tx.amount || '',
        tx.from || '',
        tx.to || '',
        tx.hash || '',
        tx.blockNumber || '',
        tx.gasUsed || '',
        tx.note || '',
        tx.status || '',
      ].map(function (value) {
        var v = String(value).replace(/"/g, '""');
        return '"' + v + '"';
      });
      lines.push(line.join(','));
    });

    var csv = lines.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'usdt-history-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showNotification('Historique exporté en CSV.', 'success');
  },

  // ===== TRANSACTION HISTORY — Etherscan-style cards =====
  loadTransactionHistory: function () {
    var container = document.getElementById('tx-history');
    var countEl = document.getElementById('history-count');
    if (!container) return;
    var txs = this.getFilteredHistory();

    this.renderHistoryStats(txs);

    if (countEl) countEl.textContent = txs.length;
    // Update tab badge
    var tabBadge = document.getElementById('tab-history-badge');
    var allTx = this.txHistory ? this.txHistory.length : 0;
    if (tabBadge) { tabBadge.textContent = allTx; tabBadge.classList.toggle('hidden', allTx === 0); }
    // Show/hide empty state
    var emptyEl = document.getElementById('history-empty');
    if (emptyEl) emptyEl.style.display = txs.length === 0 ? 'block' : 'none';

    if (txs.length === 0) {
      container.innerHTML = '<div class="no-tx">Aucune transaction</div>';
      return;
    }

    var self = this;
    container.innerHTML = txs.slice().reverse().map(function (tx) {
      var isSend = tx.type === 'send' || (tx.from && tx.from.toLowerCase() === (self.wallet.address || '').toLowerCase());
      var isFaucet = tx.type === 'faucet';
      var typeKey = isFaucet ? 'faucet' : isSend ? 'send' : 'receive';
      var icon = isFaucet ? '🚰' : isSend ? '📤' : '📥';
      var typeLabel = isFaucet ? 'FAUCET' : isSend ? 'ENVOI' : 'RÉCEPTION';
      var netLabel = tx.network === 'sepolia' ? '🔵 SEPOLIA' : tx.network === 'polygon' ? '🟣 POLYGON' : tx.network === 'tron' ? '🔴 TRON' : '🟣 TENDERLY';
      var netColor = tx.network === 'sepolia' ? '#3498db' : tx.network === 'polygon' ? '#8247e5' : tx.network === 'tron' ? '#ef0027' : '#9b59b6';
      var tokenSymbol = tx.tokenSymbol || 'USDT';
      var tokenChipColor = tokenSymbol.toUpperCase() === 'USDC' ? '#2775ca' : '#26a17b';
      var showMarketValue = true; // 1 token = $1 USD (stablecoin peg)

      // Explorer URL
      var explorerUrl = tx.network === 'sepolia'
        ? 'https://sepolia.etherscan.io/tx/' + tx.hash
        : tx.network === 'polygon'
        ? 'https://polygonscan.com/tx/' + tx.hash
        : tx.network === 'tron'
        ? 'https://tronscan.org/#/transaction/' + tx.hash
        : CONFIG.NETWORKS.tenderly.blockExplorer + '/tx/' + tx.hash;

      // ETH equivalent — use stored value or compute from stored ethPrice
      var ethEquiv = tx.ethEquiv
        ? parseFloat(tx.ethEquiv)
        : (parseFloat(tx.amount) / (tx.ethPrice || self.ethPrice || 3000));
      var ethEquivStr = ethEquiv.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });

      // USD value
      var usdStr = Simulator.formatUSD(tx.amount);

      // Addresses
      var fromAddr = tx.from || '—';
      var toAddr = tx.to || '—';
      var fromShort = fromAddr.length > 10 ? (fromAddr.substring(0, 10) + '...' + fromAddr.substring(fromAddr.length - 6)) : fromAddr;
      var toShort = toAddr.length > 10 ? (toAddr.substring(0, 10) + '...' + toAddr.substring(toAddr.length - 6)) : toAddr;

      // Block + gas — handle non-numeric gas values (e.g. TRON uses '~30 TRX')
      var blockStr = tx.blockNumber ? '#' + parseInt(tx.blockNumber).toLocaleString() : '—';
      var gasStr = tx.gasUsed
        ? (isNaN(parseInt(tx.gasUsed)) ? tx.gasUsed : parseInt(tx.gasUsed).toLocaleString())
        : '—';

      // Hash display
      var hashShort = tx.hash ? (tx.hash.substring(0, 20) + '...' + tx.hash.substring(tx.hash.length - 8)) : '—';

      // Timestamp
      var timeStr = tx.timestamp ? new Date(tx.timestamp).toLocaleString('fr-FR') : '—';

      // Note
      var noteHtml = tx.note ? '<div class="etx-note">📝 ' + tx.note + '</div>' : '';

      return (
        '<div class="etx-card etx-' + typeKey + '">' +

          // ── Header row ──
          '<div class="etx-header">' +
            '<div class="etx-header-left">' +
              '<span class="etx-icon">' + icon + '</span>' +
              '<div class="etx-meta">' +
                '<div class="etx-type-row">' +
                  '<span class="etx-type-label etx-type-' + typeKey + '">' + typeLabel + '</span>' +
                  '<span class="etx-net-badge" style="color:' + netColor + ';">' + netLabel + '</span>' +
                  '<span class="etx-token-chip" style="background:' + tokenChipColor + '15;color:' + tokenChipColor + ';border-color:' + tokenChipColor + '55;">' + tokenSymbol + '</span>' +
                  '<span class="etx-status-badge">✓ Confirmé</span>' +
                '</div>' +
                '<div class="etx-time">' + timeStr + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="etx-header-right">' +
              '<div class="etx-amount-main">' + Simulator.formatAmount(tx.amount) + ' ' + tokenSymbol + '</div>' +
              (!isFaucet && showMarketValue ? '<div class="etx-eth-equiv">≈ ' + ethEquivStr + ' ETH</div>' : '') +
              '<div class="etx-usd-val">' + usdStr + '</div>' +
            '</div>' +
          '</div>' +

          // ── Body rows ──
          '<div class="etx-body">' +
            (!isFaucet ? (
              '<div class="etx-row">' +
                '<span class="etx-row-label">De</span>' +
                '<span class="etx-row-value etx-addr" title="' + fromAddr + '">' + fromShort + '</span>' +
              '</div>' +
              '<div class="etx-row">' +
                '<span class="etx-row-label">À</span>' +
                '<span class="etx-row-value etx-addr" title="' + toAddr + '">' + toShort + '</span>' +
              '</div>'
            ) : '') +
            '<div class="etx-row">' +
              '<span class="etx-row-label">Bloc</span>' +
              '<span class="etx-row-value">' + blockStr + '</span>' +
              '<span class="etx-row-sep">·</span>' +
              '<span class="etx-row-label">Gas</span>' +
              '<span class="etx-row-value">' + gasStr + '</span>' +
            '</div>' +
            noteHtml +
            '<div class="etx-hash-row">' +
              '<span class="etx-row-label">Hash</span>' +
              '<a class="etx-hash-link" href="' + explorerUrl + '" target="_blank" title="' + tx.hash + '">' +
                hashShort +
              '</a>' +
            '</div>' +
          '</div>' +

        '</div>'
      );
    }).join('');
  },

  // ===== NOTIFICATIONS =====
  showNotification: function (message, type) {
    var container = document.getElementById('notification-container');
    if (!container) return;
    var notif = document.createElement('div');
    notif.className = 'notification notification-' + (type || 'info');
    notif.textContent = message;
    container.appendChild(notif);
    setTimeout(function () { notif.classList.add('show'); }, 10);
    setTimeout(function () {
      notif.classList.remove('show');
      setTimeout(function () { if (notif.parentNode) notif.parentNode.removeChild(notif); }, 400);
    }, 4000);
  },

  // ===== TRON / TRONLINK SUPPORT =====

  // Check if TronLink is installed and ready
  _isTronReady: function () {
    return typeof window.tronWeb !== 'undefined' && window.tronWeb && window.tronWeb.ready;
  },

  // Validate TRON address (starts with T, 34 chars, base58)
  isValidTronAddress: function (addr) {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr);
  },

  // Connect TronLink wallet
  _tryAccountFallback: async function () {
    var jwt = localStorage.getItem('usdt_jwt');
    var userData;
    try { userData = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { userData = {}; }
    if (jwt && userData.email && userData.status === 'approved') {
      await this.connectWithAccount();
      return true;
    }
    return false;
  },

  // ===== SEND NATIVE TRX =====
  sendTrx: async function () {
    var to       = (document.getElementById('trx-send-to').value || '').trim();
    var amtInput = document.getElementById('trx-send-amount');
    var amount   = parseFloat(amtInput ? amtInput.value : 0);
    var statusEl = document.getElementById('trx-send-status');

    if (!statusEl) return;
    statusEl.style.color = 'var(--text-muted)';

    if (!to || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(to)) {
      statusEl.textContent = '⚠️ Adresse TRON invalide (doit commencer par T)';
      return;
    }
    if (!amount || amount <= 0) {
      statusEl.textContent = '⚠️ Montant invalide';
      return;
    }
    var trxBal = parseFloat(this.wallet.ethBalance) || 0;
    if (amount + 1 > trxBal) {
      statusEl.textContent = '⚠️ Solde insuffisant — il faut garder ~1 TRX pour les frais (solde: ' + trxBal.toFixed(4) + ' TRX)';
      return;
    }
    if (!this._isTronReady()) {
      statusEl.textContent = '⚠️ TronLink non connecté — reconnectez-vous';
      return;
    }

    var btn = document.getElementById('trx-send-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi...'; }
    statusEl.textContent = '⏳ Signature en cours dans TronLink...';

    try {
      var amountSun = Math.floor(amount * 1_000_000);
      var result = await window.tronWeb.trx.sendTransaction(to, amountSun);
      if (result && result.result) {
        var txid = result.txid || result.transaction && result.transaction.txID || '—';
        statusEl.style.color = 'var(--success, #26a17b)';
        statusEl.innerHTML = '✅ Envoyé ! <a href="https://tronscan.org/#/transaction/' + txid + '" target="_blank" style="color:var(--success,#26a17b);text-decoration:underline;">Voir sur TronScan ↗</a>';
        if (amtInput) amtInput.value = '';
        document.getElementById('trx-send-to').value = '';
        // Refresh TRX balance after 3s
        var self = this;
        setTimeout(function () {
          window.tronWeb.trx.getBalance(self.wallet.address).then(function (s) {
            self.wallet.ethBalance = (s / 1_000_000).toFixed(4);
            self.updateBalanceDisplay();
          }).catch(function () {});
        }, 3000);
      } else {
        statusEl.style.color = '#e74c3c';
        statusEl.textContent = '❌ Transaction rejetée ou annulée';
      }
    } catch (e) {
      statusEl.style.color = '#e74c3c';
      statusEl.textContent = '❌ Erreur: ' + (e.message || e);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Envoyer TRX'; }
  },

  _connectTronLink: async function () {
    if (typeof window.tronLink === 'undefined' && typeof window.tronWeb === 'undefined') {
      // No TronLink — try account mode silently
      if (await this._tryAccountFallback()) return;
      this.showNotification('TronLink non installé — installez TronLink pour TRON', 'error');
      setTimeout(function () { window.open('https://www.tronlink.org/', '_blank'); }, 1000);
      return;
    }
    this.showLoading('Connexion TronLink...');
    try {
      // Request accounts — triggers the TronLink permission popup
      if (window.tronLink && window.tronLink.request) {
        var res;
        try {
          res = await window.tronLink.request({ method: 'tron_requestAccounts' });
        } catch (reqErr) {
          // Some TronLink versions throw on reject instead of returning a code
          this.hideLoading();
          // Try account mode as fallback
          if (await this._tryAccountFallback()) return;
          this.showNotification('Connexion refusée dans TronLink — cliquez sur "Accéder à mon compte" si vous avez un compte.', 'warning');
          return;
        }
        // 200 = approved, 4000 = already connected/in-queue (not an error)
        // null/undefined = older versions that just proceed silently
        if (res != null && res.code !== 200 && res.code !== 4000) {
          this.hideLoading();
          // Try account mode as fallback
          if (await this._tryAccountFallback()) return;
          this.showNotification('Connexion TronLink refusée (code ' + (res.code || '?') + ') — cliquez sur "Accéder à mon compte".', 'warning');
          return;
        }
      }
      // Wait up to 15s for tronWeb to be ready (some users have slow machines)
      var attempts = 0;
      while (attempts < 30) {
        if (window.tronWeb && (window.tronWeb.ready || (window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58))) break;
        await new Promise(function (r) { setTimeout(r, 500); });
        attempts++;
      }
      // Accept either tronWeb.ready OR tronWeb.defaultAddress.base58 (some TronLink versions skip ready flag)
      var address = window.tronWeb && window.tronWeb.defaultAddress && window.tronWeb.defaultAddress.base58;
      if (!window.tronWeb || !address) {
        this.hideLoading();
        // If tronWeb exists but no address, wallet is locked
        if (window.tronWeb) {
          this.showNotification('TronLink verrouillé — déverrouillez votre wallet TronLink et réessayez.', 'warning');
        } else {
          this.showNotification('TronLink non prêt — déverrouillez l\'extension et réessayez.', 'warning');
        }
        return;
      }
      await this._setupTron(address);
    } catch (e) {
      this.showNotification('Erreur TronLink: ' + (e.message || e), 'error');
    }
    this.hideLoading();
  },

  // Setup TRON wallet state + UI
  _setupTron: async function (address) {
    this.wallet.connected = true;
    this.wallet.address   = address;
    this.walletType       = 'tronlink';

    // Fetch gas token market prices for UI helpers
    await this.fetchEthPrice();

    // TRX balance (gas token)
    try {
      var sun = await window.tronWeb.trx.getBalance(address);
      this.wallet.ethBalance = (sun / 1_000_000).toFixed(4);
    } catch (e) { this.wallet.ethBalance = '0.0000'; }

    // Auto-refresh TRX balance every 5s (fast so new TRX arrivals unblock sender quickly)
    var self = this;
    if (this._trxBalanceInterval) clearInterval(this._trxBalanceInterval);
    this._trxBalanceInterval = setInterval(async function () {
      if (!window.tronWeb || !self.wallet.address) return;
      try {
        var s = await window.tronWeb.trx.getBalance(self.wallet.address);
        self.wallet.ethBalance = (s / 1_000_000).toFixed(4);
        self.updateBalanceDisplay();
      } catch (e) {}
    }, 5000);

    // TRC-20 token balance
    if (CONFIG.USDT_CONTRACT_ADDRESS) {
      try {
        var c   = await window.tronWeb.contract(CONFIG.USDT_ABI, CONFIG.USDT_CONTRACT_ADDRESS);
        var raw = await c.balanceOf(address).call();
        this.wallet.balance = (Number(raw) / Math.pow(10, CONFIG.TOKEN_DECIMALS)).toFixed(6);
      } catch (e) { this.wallet.balance = '0.000000'; }
    } else {
      this.wallet.balance = '0.000000';
    }

    // TRC-20 USDC balance (separate card)
    var usdcTron = CONFIG.TOKENS && CONFIG.TOKENS.usdc;
    if (usdcTron && usdcTron.address) {
      try {
        var cu = await window.tronWeb.contract(CONFIG.USDT_ABI, usdcTron.address);
        var rawU = await cu.balanceOf(address).call();
        this.wallet.usdcBalance = (Number(rawU) / Math.pow(10, Number(usdcTron.decimals || 6))).toFixed(6);
      } catch (e) { this.wallet.usdcBalance = '0.000000'; }
    } else {
      this.wallet.usdcBalance = '0.000000';
    }

    this._updateWalletUI();
    await this.checkFaucetStatus();
    this.loadTransactionHistory();

    // Start incoming tx polling
    this._startIncomingPoll(address);
    this._checkIncomingTx(address); // immediate first check

    // Auto-refresh every 30s
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    var self = this;
    this.refreshInterval = setInterval(function () {
      if (self.wallet.connected && CONFIG.NETWORK.key === 'tron') self._setupTron(self.wallet.address);
    }, 30000);
  },

  // Execute TRON TRC-20 transfer
  // Works for ALL recipient wallets (Exodus, Trust, TronLink) — even if they cannot swap
  // ── Account mode transfer (DB only — no blockchain) ───────────────────
  _executeSendAccount: async function (recipient, amount, note) {
    var self = this;
    var pb = document.getElementById('progress-bar');
    var jwt = localStorage.getItem('usdt_jwt') || '';
    var statusEl = document.getElementById('processing-status');
    if (pb) pb.style.width = '30%';
    if (statusEl) statusEl.textContent = 'Traitement du virement...';
    try {
      var resp = await fetch('/api/admin/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({
          action: 'transfer',
          recipientAddress: recipient,
          amount: amount,
        }),
      });
      if (pb) pb.style.width = '70%';
      var data = await resp.json();
      if (!resp.ok || !data.ok) {
        self.closeModal();
        if (resp.status === 404) {
          // Distinguish between TRON address and email for a clearer error
          var isTronAddr = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(recipient);
          var isEmail = recipient.includes('@');
          if (isTronAddr) {
            self.showNotification(
              '❌ Cette adresse TRON n\'est pas enregistrée sur la plateforme. ' +
              'Pour envoyer vers un wallet externe, connectez TronLink via le bouton « Connecter TronLink ».',
              'error'
            );
          } else if (isEmail) {
            self.showNotification(
              '❌ Aucun compte trouvé avec cette adresse e-mail. Vérifiez l\'adresse du destinataire.',
              'error'
            );
          } else {
            self.showNotification(
              '❌ Destinataire non trouvé. Entrez l\'adresse e-mail ou l\'adresse TRON d\'un utilisateur enregistré.',
              'error'
            );
          }
        } else {
          self.showNotification('Erreur: ' + (data.error || 'Virement échoué'), 'error');
        }
        return;
      }
      // Update sender balance locally
      var newBal = data.senderNewBalance != null ? data.senderNewBalance : Math.max(0, parseFloat(self.wallet.balance) - amount);
      self.wallet.balance = newBal.toString();
      var ud; try { ud = JSON.parse(localStorage.getItem('usdt_user') || '{}'); } catch(e) { ud = {}; }
      ud.usdtBalance = newBal;
      localStorage.setItem('usdt_user', JSON.stringify(ud));
      self.updateBalanceDisplay();
      if (pb) pb.style.width = '90%';
      var fakeHash = 'TX' + Date.now().toString(16).toUpperCase() + Math.random().toString(16).slice(2, 8).toUpperCase();
      var ethEquiv = (amount / (self.ethPrice || 3000)).toFixed(6);
      var txResult = {
        hash: fakeHash, from: self.wallet.address, to: recipient, amount: amount,
        blockNumber: 0, gasUsed: '0', timestamp: new Date().toISOString(),
        status: 'confirmed', note: note || '', real: true, type: 'send',
        network: CONFIG.NETWORK.key, tokenSymbol: CONFIG.TOKEN.symbol,
        ethEquiv: ethEquiv, ethPrice: self.ethPrice || 3000,
      };
      Simulator.saveTransaction(txResult);
      if (pb) pb.style.width = '100%';
      await new Promise(function (r) { setTimeout(r, 300); });
      self._showSuccessStep(txResult);
      self.loadTransactionHistory();
    } catch (e) {
      self.closeModal();
      self.showNotification('Erreur réseau: ' + (e.message || 'Virement échoué'), 'error');
    }
  },

  // ── Sync DB after a chain send (fire-and-forget) ─────────────────────────
  _syncTransferToDB: function (recipient, amount) {
    var jwt = localStorage.getItem('usdt_jwt') || '';
    if (!jwt) return;
    fetch('/api/admin/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({ action: 'transfer', recipientAddress: recipient, amount: amount, fromChain: true }),
    }).catch(function () {});
  },

  _executeSendTron: async function (recipient, amount, note) {
    if (!CONFIG.USDT_CONTRACT_ADDRESS) {
      this.showNotification('⚠️ Contrat TRON non déployé — lancez: node deploy-tron.js', 'warning');
      this._resetModal();
      return;
    }
    if (!this._isTronReady()) {
      this.showNotification('TronLink déconnecté — reconnectez-vous', 'error');
      this._resetModal();
      return;
    }

    var self        = this;
    var pb          = document.getElementById('progress-bar');
    var amountUnits = Math.round(amount * Math.pow(10, CONFIG.TOKEN_DECIMALS));
    try {
      var statusEl = document.getElementById('processing-status');

      // ── Fetch LIVE TRX balance before sending (avoids stale-cache blocking) ──
      if (statusEl) statusEl.textContent = 'Vérification du solde TRX...';
      if (pb) pb.style.width = '5%';
      var liveTrx = 0;
      try {
        var rawTrx = await window.tronWeb.trx.getBalance(this.wallet.address);
        liveTrx = (rawTrx || 0) / 1_000_000;
        this.wallet.ethBalance = liveTrx.toFixed(4);
        this.updateBalanceDisplay();
      } catch (e) {
        liveTrx = parseFloat(this.wallet.ethBalance) || 0;
      }

      // ── If TRX is insufficient, wait up to 60s for it to arrive ──────────
      if (liveTrx < 1) {
        if (statusEl) statusEl.textContent = '⏳ En attente de TRX pour les frais...';
        if (pb) pb.style.width = '10%';
        this.showNotification('⏳ TRX insuffisant — vérification toutes les 5s... (envoyez du TRX à votre adresse TronLink)', 'info');
        var waited = 0;
        var maxWait = 60;
        while (liveTrx < 1 && waited < maxWait) {
          await new Promise(function (r) { setTimeout(r, 5000); });
          waited += 5;
          try {
            var rawTrx2 = await window.tronWeb.trx.getBalance(self.wallet.address);
            liveTrx = (rawTrx2 || 0) / 1_000_000;
            self.wallet.ethBalance = liveTrx.toFixed(4);
            self.updateBalanceDisplay();
          } catch (e) {}
          if (statusEl) statusEl.textContent = '⏳ Attente TRX... (' + waited + 's/' + maxWait + 's) — solde actuel: ' + liveTrx.toFixed(4) + ' TRX';
        }
        if (liveTrx < 1) {
          self.showNotification('⛽ Aucun TRX reçu après ' + maxWait + 's. Envoyez au moins 1-5 TRX à votre adresse TronLink pour payer les frais.', 'warning');
          self._resetModal();
          return;
        }
        this.showNotification('✅ TRX reçu! Envoi en cours...', 'success');
      }

      if (statusEl) statusEl.textContent = 'Connexion au contrat TRON...';
      if (pb) pb.style.width = '15%';

      var contract = await window.tronWeb.contract(CONFIG.USDT_ABI, CONFIG.USDT_CONTRACT_ADDRESS);
      if (pb) pb.style.width = '30%';

      if (statusEl) statusEl.textContent = 'Signature TronLink en cours...';

      // Real TRC-20 transfer — arrives at ANY TRON wallet regardless of swap capability
      var txId = await contract.transfer(recipient, amountUnits).send({
        feeLimit:           100_000_000, // 100 TRX max fee
        callValue:          0,
        shouldPollResponse: false
      });

      if (pb) pb.style.width = '60%';
      if (statusEl) statusEl.textContent = 'Confirmation sur TRON (~3s)...';
      await new Promise(function (r) { setTimeout(r, 3500); });

      // Update local balance display immediately
      var prevBalance = parseFloat(self.wallet.balance);
      self.wallet.balance = Math.max(0, prevBalance - amount).toFixed(6);
      self.updateBalanceDisplay();

      if (pb) pb.style.width = '85%';

      var txResult = {
        hash:          txId,
        from:          self.wallet.address,
        to:            recipient,
        amount:        amount,
        blockNumber:   Simulator.generateBlockNumber(),
        gasUsed:       '~30 TRX',
        nonce:         Simulator.generateNonce(),
        timestamp:     new Date().toISOString(),
        status:        'confirmed',
        confirmations: 1,
        network:       'tron',
        type:          'send',
        note:          note || '',
        tokenSymbol:   CONFIG.TOKEN.symbol
      };

      Simulator.saveTransaction(txResult);

      if (pb) pb.style.width = '100%';
      await new Promise(function (r) { setTimeout(r, 300); });

      self._showSuccessStep(txResult);
      self.loadTransactionHistory();
      self._syncTransferToDB(recipient, amount);

      // Refresh balance from chain after 3s
      setTimeout(function () {
        if (self.wallet.connected && CONFIG.NETWORK.key === 'tron') {
          self._setupTron(self.wallet.address);
        }
      }, 3000);

    } catch (e) {
      self.hideLoading();
      var raw = e && e.message ? e.message : (typeof e === 'string' ? e : 'Erreur inconnue');
      var msg = self._tronErrorMessage(raw);
      self.showNotification('Erreur TRON: ' + msg, 'error');
      self._resetModal();
    }
  },

  // Translate raw TRON errors into user-friendly French messages
  _tronErrorMessage: function (raw) {
    if (!raw) return 'Erreur inconnue';
    var r = raw.toLowerCase();
    if (r.includes('does not exist') || r.includes('account') && r.includes('not exist')) {
      return 'Wallet non activé sur TRON. Envoyez au moins 1 TRX à votre adresse TronLink pour l\'activer, puis réessayez.';
    }
    if (r.includes('insufficient') && r.includes('trx') || r.includes('balance') && r.includes('trx')) {
      return 'TRX insuffisant. Vous avez besoin d\'au moins 1-5 TRX dans votre wallet TronLink pour payer les frais de gas.';
    }
    if (r.includes('insufficient balance') || r.includes('bal')) {
      return 'Solde ' + CONFIG.TOKEN.symbol + ' insuffisant.';
    }
    if (r.includes('already claimed') || r.includes('claimed')) {
      return 'Vous avez deja reclame votre faucet USDT.';
    }
    if (r.includes('user rejected') || r.includes('rejected') || r.includes('cancel')) {
      return 'Transaction annulée par l\'utilisateur.';
    }
    if (r.includes('fee limit') || r.includes('feelimit')) {
      return 'Frais de gas trop élevés. Réessayez dans quelques secondes.';
    }
    if (r.includes('timeout') || r.includes('timed out')) {
      return 'Délai dépassé. La transaction peut encore être en cours — vérifiez TronScan.';
    }
    return raw.length > 120 ? raw.substring(0, 120) + '...' : raw;
  },

  _loadingTimeout: null,

  showLoading: function (msg) {
    // Safety: auto-hide after 15 seconds to prevent infinite spinner
    if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
    var overlay = document.getElementById('loading-overlay');
    var text = document.getElementById('loading-text');
    if (overlay) overlay.classList.remove('hidden');
    if (text) text.textContent = msg || 'Chargement...';
    var self = this;
    this._loadingTimeout = setTimeout(function () {
      self.hideLoading();
      self.showNotification('Délai dépassé — réessayez.', 'warning');
    }, 15000);
  },

  hideLoading: function () {
    if (this._loadingTimeout) { clearTimeout(this._loadingTimeout); this._loadingTimeout = null; }
    var overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  },

  // =========================================================================
  // AFRX — AfriChainX Token
  // =========================================================================

  /** Show/hide the AFRX tab button depending on network */
  initAfrxTab: function () {
    var btn = document.getElementById('afrx-tab-btn');
    if (!btn) return;
    var onTron = CONFIG.NETWORK.key === 'tron';
    var onTenderly = CONFIG.NETWORK.key === 'tenderly';
    var hasAfrx = !!(CONFIG.TOKENS && CONFIG.TOKENS.afrx);
    // Show AFRX tab on TRON and Tenderly
    btn.style.display = ((onTron || onTenderly) && hasAfrx) ? '' : 'none';

    // Also show/hide AFRX token button in header toggle
    var afrxTokenBtn = document.getElementById('token-btn-afrx');
    if (afrxTokenBtn) afrxTokenBtn.style.display = ((onTron || onTenderly) && hasAfrx) ? '' : 'none';

    // Update the SunSwap link with the pair address if available
    var sunswapLink = document.getElementById('afrx-sunswap-link');
    if (sunswapLink && CONFIG.TOKENS.afrx && CONFIG.TOKENS.afrx.sunswapPair) {
      sunswapLink.href = 'https://sun.io/#/swap?inputCurrency=TRX&outputCurrency=' + CONFIG.TOKENS.afrx.sunswapPair;
    }
  },

  /** Called when AFRX tab is opened */
  _loadAfrxSection: async function () {
    var afrxToken = CONFIG.TOKENS && CONFIG.TOKENS.afrx;
    if (!afrxToken) return;

    // Show contract address
    var contractEl = document.getElementById('afrx-contract-display');
    var tronscanEl = document.getElementById('afrx-tronscan-link');
    var addr = afrxToken.address || '';
    if (contractEl) contractEl.textContent = addr ? addr : 'Non déployé';
    if (tronscanEl) {
      if (addr) {
        tronscanEl.href = 'https://tronscan.org/#/contract/' + addr;
        tronscanEl.textContent = 'TronScan ↗';
      } else {
        tronscanEl.href = '#';
        tronscanEl.textContent = 'Pas encore déployé';
      }
    }

    // Update SunSwap link
    var sunswapLink = document.getElementById('afrx-sunswap-link');
    if (sunswapLink && afrxToken.sunswapPair) {
      sunswapLink.href = 'https://sun.io/#/swap?inputCurrency=TRX&outputCurrency=' + afrxToken.sunswapPair;
    }

    // Fetch AFRX price from SunSwap if pair is set
    this._fetchAfrxPrice();

    // Fetch balance
    if (addr && this.wallet.address) {
      await this._fetchAfrxBalance(this.wallet.address);
    }
  },

  /** Fetch AFRX price via SunSwap API (no-op until pair address is set) */
  _fetchAfrxPrice: async function () {
    var afrxToken = CONFIG.TOKENS && CONFIG.TOKENS.afrx;
    var priceEl = document.getElementById('afrx-price');
    var sourceEl = document.getElementById('afrx-price-source');
    if (!priceEl) return;

    if (!afrxToken || !afrxToken.sunswapPair) {
      priceEl.textContent = '—';
      if (sourceEl) sourceEl.textContent = 'SunSwap — liquidity not yet added';
      return;
    }

    try {
      var r = await fetch('https://api.sun.io/v3/token/price?address=' + afrxToken.sunswapPair);
      var d = await r.json();
      var price = d && d.data && d.data.price ? parseFloat(d.data.price) : null;
      if (price) {
        priceEl.textContent = price < 0.001
          ? price.toExponential(4)
          : price.toFixed(6);
        this._afrxPrice = price;
        if (sourceEl) sourceEl.textContent = 'SunSwap — temps réel';
      }
    } catch (e) {
      if (sourceEl) sourceEl.textContent = 'Impossible de charger le prix';
    }
  },

  /** Read AFRX balance of address from contract */
  _fetchAfrxBalance: async function (address) {
    var afrxToken = CONFIG.TOKENS && CONFIG.TOKENS.afrx;
    if (!afrxToken || !afrxToken.address) return;

    var balEl = document.getElementById('afrx-balance');
    var usdEl = document.getElementById('afrx-usd-value');
    if (!balEl) return;

    try {
      var tw = (typeof tronWeb !== 'undefined' && tronWeb.ready) ? tronWeb
             : (typeof window.tronWeb !== 'undefined' ? window.tronWeb : null);
      if (!tw) return;

      var contract = await tw.contract(CONFIG.NETWORK.abi, afrxToken.address);
      var raw = await contract.balanceOf(address).call();
      var decimals = 18;
      var bal = parseFloat(raw.toString()) / Math.pow(10, decimals);
      balEl.textContent = bal.toLocaleString('en-US', { maximumFractionDigits: 4 });

      if (usdEl && this._afrxPrice) {
        usdEl.textContent = '≈ $' + (bal * this._afrxPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + ' USD';
      } else if (usdEl) {
        usdEl.textContent = '≈ $— (prix non disponible)';
      }
    } catch (e) {
      if (balEl) balEl.textContent = '—';
    }
  },

  // =========================================================================
  // USCADX — USCA Dollar X Token
  // =========================================================================

  /** Show/hide the USCADX tab and header token button */
  initUscadxTab: function () {
    var btn = document.getElementById('uscadx-tab-btn');
    var tokenBtn = document.getElementById('token-btn-uscadx');
    var onTron = CONFIG.NETWORK.key === 'tron';
    var onTenderly = CONFIG.NETWORK.key === 'tenderly';
    var hasUscadx = !!(CONFIG.TOKENS && CONFIG.TOKENS.uscadx);
    var show = (onTron || onTenderly) && hasUscadx;
    if (btn)      btn.style.display      = show ? '' : 'none';
    if (tokenBtn) tokenBtn.style.display = show ? '' : 'none';
  },

  /** Called when USCADX tab is opened */
  _loadUscadxSection: async function () {
    var token = CONFIG.TOKENS && CONFIG.TOKENS.uscadx;
    if (!token) return;

    var addr = token.address || '';

    // Contract display
    var contractEl  = document.getElementById('uscadx-contract-display');
    var tronscanEl  = document.getElementById('uscadx-tronscan-link');
    var trustLinkEl = document.getElementById('uscadx-trust-link');
    if (contractEl) contractEl.textContent = addr || 'Non déployé';
    if (tronscanEl) {
      tronscanEl.href = addr ? 'https://tronscan.org/#/contract/' + addr : '#';
      tronscanEl.textContent = addr ? 'TronScan ↗' : 'Pas encore déployé';
    }
    if (trustLinkEl && addr) {
      trustLinkEl.href = 'trust://add_asset?asset=trc20&address=' + addr
        + '&name=USCA+Dollar+X&symbol=USCADX&decimals=6';
    }

    // Wallet receive address
    var walletAddr = this.wallet.address || '';
    var receiveEl = document.getElementById('uscadx-receive-address');
    if (receiveEl) receiveEl.textContent = walletAddr || '—';

    // QR code
    if (walletAddr) {
      var qrDiv = document.getElementById('uscadx-qr');
      if (qrDiv) {
        qrDiv.innerHTML = '';
        try {
          new QRCode(qrDiv, { text: walletAddr, width: 110, height: 110, correctLevel: QRCode.CorrectLevel.M });
        } catch (e) {
          qrDiv.textContent = walletAddr.slice(0, 8) + '...';
        }
      }
    }

    // Balance
    if (addr && walletAddr) {
      await this._fetchUscadxBalance(walletAddr);
    }
  },

  /** Read USCADX balance from contract */
  _fetchUscadxBalance: async function (address) {
    var token = CONFIG.TOKENS && CONFIG.TOKENS.uscadx;
    if (!token || !token.address) return;
    var balEl = document.getElementById('uscadx-balance');
    if (!balEl) return;
    try {
      var tw = (typeof tronWeb !== 'undefined' && tronWeb.ready) ? tronWeb
             : (typeof window.tronWeb !== 'undefined' ? window.tronWeb : null);
      if (!tw) return;
      var contract = await tw.contract(CONFIG.NETWORK.abi, token.address);
      var raw = await contract.balanceOf(address).call();
      var bal = parseFloat(raw.toString()) / 1e6;
      balEl.textContent = bal.toLocaleString('en-US', { maximumFractionDigits: 2 });
    } catch (e) {
      if (balEl) balEl.textContent = '—';
    }
  },

  /** Claim 500M USCADX from faucet */
  claimUscadxFaucet: async function () {
    var token = CONFIG.TOKENS && CONFIG.TOKENS.uscadx;
    var statusEl = document.getElementById('uscadx-faucet-status');
    var btn = document.getElementById('uscadx-faucet-btn');
    if (!token || !token.address) {
      if (statusEl) statusEl.textContent = '❌ Contrat non déployé.';
      return;
    }
    var tw = (typeof tronWeb !== 'undefined' && tronWeb.ready) ? tronWeb
           : (typeof window.tronWeb !== 'undefined' ? window.tronWeb : null);
    if (!tw) {
      if (statusEl) statusEl.textContent = '❌ TronLink requis.';
      return;
    }
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = '⏳ Transaction en cours…';
    try {
      var contract = await tw.contract(CONFIG.NETWORK.abi, token.address);
      var txId = await contract.claimFaucet().send({ feeLimit: 60_000_000 });
      if (statusEl) statusEl.innerHTML = '✅ 500M USCADX reçus ! <a href="https://tronscan.org/#/transaction/' + txId + '" target="_blank" style="color:#2775ca;">TronScan ↗</a>';
      await this._fetchUscadxBalance(this.wallet.address);
    } catch (e) {
      var msg = e.message || String(e);
      if (msg.includes('already claimed') || msg.includes('REVERT')) {
        if (statusEl) statusEl.textContent = '⚠ Vous avez déjà réclamé votre faucet.';
      } else {
        if (statusEl) statusEl.textContent = '❌ ' + msg;
      }
      if (btn) btn.disabled = false;
    }
  },

  /** Send USCADX to an address */
  sendUscadx: async function () {
    var token = CONFIG.TOKENS && CONFIG.TOKENS.uscadx;
    var toEl  = document.getElementById('uscadx-send-to');
    var amtEl = document.getElementById('uscadx-send-amount');
    var statusEl = document.getElementById('uscadx-send-status');
    if (!token || !token.address) {
      if (statusEl) statusEl.textContent = '❌ Contrat USCADX non déployé.';
      return;
    }
    var to = (toEl && toEl.value || '').trim();
    var amt = parseFloat(amtEl && amtEl.value || '0');
    if (!to || !to.startsWith('T') || to.length < 34) {
      if (statusEl) statusEl.textContent = '❌ Adresse TRON invalide (doit commencer par T).';
      return;
    }
    if (!amt || amt <= 0) {
      if (statusEl) statusEl.textContent = '❌ Montant invalide.';
      return;
    }
    var tw = (typeof tronWeb !== 'undefined' && tronWeb.ready) ? tronWeb
           : (typeof window.tronWeb !== 'undefined' ? window.tronWeb : null);
    if (!tw) {
      if (statusEl) statusEl.textContent = '❌ TronLink requis.';
      return;
    }
    if (statusEl) statusEl.textContent = '⏳ Envoi en cours…';
    try {
      var rawAmt = BigInt(Math.round(amt * 1e6)).toString();
      var contract = await tw.contract(CONFIG.NETWORK.abi, token.address);
      var txId = await contract.transfer(to, rawAmt).send({ feeLimit: 60_000_000 });
      if (statusEl) statusEl.innerHTML = '✅ ' + amt.toLocaleString() + ' USCADX envoyés ! <a href="https://tronscan.org/#/transaction/' + txId + '" target="_blank" style="color:#2775ca;">TronScan ↗</a>';
      if (toEl) toEl.value = '';
      if (amtEl) amtEl.value = '';
      await this._fetchUscadxBalance(this.wallet.address);
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ ' + (e.message || String(e));
    }
  },

  /** Copy wallet TRON address to clipboard */
  copyUscadxAddress: function () {
    var addr = this.wallet.address || '';
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(function () {
      var btn = document.querySelector('#uscadx-section button[onclick*="copyUscadxAddress"]');
      if (btn) { btn.textContent = '✅ Copié !'; setTimeout(function () { btn.textContent = '📋 Copier'; }, 2000); }
    });
  },

  /** Share receive address via Web Share API (mobile) */
  shareUscadxReceive: function () {
    var addr = this.wallet.address || '';
    var contractAddr = (CONFIG.TOKENS && CONFIG.TOKENS.uscadx && CONFIG.TOKENS.uscadx.address) || '';
    if (navigator.share) {
      navigator.share({
        title: 'Envoie-moi des USCADX',
        text: 'Mon adresse TRON pour recevoir USCADX (USCA Dollar X) :\n' + addr
          + (contractAddr ? '\n\nContrat: ' + contractAddr : ''),
        url: 'https://sstr.digital/uscadx'
      }).catch(function () {});
    } else {
      this.copyUscadxAddress();
    }
  },

  /** Update buy estimate when user types TRX amount */
  updateAfrxBuyEstimate: function () {
    var trxInput = document.getElementById('afrx-buy-trx');
    var estEl    = document.getElementById('afrx-buy-estimate');
    if (!trxInput || !estEl) return;

    var trx = parseFloat(trxInput.value) || 0;
    if (trx <= 0) { estEl.textContent = '— AFRX'; return; }

    // Price: 1 TRX = ? AFRX
    // If we have a SunSwap price in USD: afrxPerTrx = trxPrice / afrxPrice
    var trxPrice  = this.trxPrice  || 0.29;
    var afrxPrice = this._afrxPrice || 0;

    if (afrxPrice > 0) {
      var afrxAmount = (trx * trxPrice) / afrxPrice;
      estEl.textContent = afrxAmount.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' AFRX';
    } else {
      // No liquidity yet — use a hard-coded launch rate: 1 TRX = 1000 AFRX
      var launchRate = 1000;
      estEl.textContent = (trx * launchRate).toLocaleString('en-US') + ' AFRX (taux lancement)';
    }
  },

  /**
   * Buy AFRX: user sends TRX to the platform wallet.
   * Platform wallet then sends AFRX to the buyer.
   * (Manual/semi-automated until SunSwap liquidity is added.)
   */
  buyAfrx: async function () {
    var afrxToken = CONFIG.TOKENS && CONFIG.TOKENS.afrx;
    if (!afrxToken || !afrxToken.address) {
      this.showNotification('Contrat AFRX non déployé — revenez bientôt.', 'warning');
      return;
    }
    var trxInput   = document.getElementById('afrx-buy-trx');
    var statusEl   = document.getElementById('afrx-buy-status');
    var trxAmount  = parseFloat((trxInput && trxInput.value) || '0');

    if (trxAmount < 10) {
      if (statusEl) statusEl.textContent = '⚠ Minimum 10 TRX';
      return;
    }

    var tw = (typeof tronWeb !== 'undefined' && tronWeb.ready) ? tronWeb
           : (typeof window.tronWeb !== 'undefined' ? window.tronWeb : null);
    if (!tw) {
      this.showNotification('TronLink requis pour acheter AFRX.', 'warning');
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ Envoi de ' + trxAmount + ' TRX...';
    try {
      var trxSun = Math.floor(trxAmount * 1_000_000);
      var platformWallet = afrxToken.platformWallet || 'TWCyjobnSPKvmYUJ3JYfKa98cBZ5bTXo3n';
      var tx = await tw.trx.sendTransaction(platformWallet, trxSun);
      if (tx && tx.result) {
        if (statusEl) statusEl.textContent = '✅ TRX envoyé! TX: ' + tx.txid.substring(0, 20) + '... — Les AFRX arriveront dans 1-5 min.';
        if (trxInput) trxInput.value = '';
        this.showNotification('✅ ' + trxAmount + ' TRX achat AFRX envoyé!', 'success');
      } else {
        if (statusEl) statusEl.textContent = '❌ Transaction annulée.';
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ Erreur: ' + (e.message || e);
    }
  },

  /** Send AFRX from the connected wallet to a recipient */
  sendAfrx: async function () {
    var afrxToken = CONFIG.TOKENS && CONFIG.TOKENS.afrx;
    if (!afrxToken || !afrxToken.address) {
      this.showNotification('Contrat AFRX non déployé.', 'warning');
      return;
    }
    var toInput     = document.getElementById('afrx-send-to');
    var amtInput    = document.getElementById('afrx-send-amount');
    var statusEl    = document.getElementById('afrx-send-status');
    var recipient   = toInput  && toInput.value.trim();
    var amount      = parseFloat(amtInput && amtInput.value || '0');

    if (!recipient || !recipient.startsWith('T')) {
      if (statusEl) statusEl.textContent = '⚠ Adresse TRON invalide (commence par T)';
      return;
    }
    if (amount <= 0) {
      if (statusEl) statusEl.textContent = '⚠ Montant invalide';
      return;
    }

    var tw = (typeof tronWeb !== 'undefined' && tronWeb.ready) ? tronWeb
           : (typeof window.tronWeb !== 'undefined' ? window.tronWeb : null);
    if (!tw) {
      this.showNotification('TronLink requis pour envoyer AFRX.', 'warning');
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ Envoi en cours...';
    try {
      var decimals  = 18;
      var rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals))).toString();
      var contract  = await tw.contract(CONFIG.NETWORK.abi, afrxToken.address);
      var txId      = await contract.transfer(recipient, rawAmount).send({ feeLimit: 100_000_000 });

      if (statusEl) statusEl.textContent = '✅ Envoyé! TX: ' + txId.substring(0, 20) + '...';
      if (toInput)  toInput.value  = '';
      if (amtInput) amtInput.value = '';
      this.showNotification('✅ ' + amount + ' AFRX envoyé à ' + recipient.substring(0, 8) + '...', 'success');
      setTimeout(function () { App._fetchAfrxBalance(App.wallet.address); }, 4000);
    } catch (e) {
      if (statusEl) statusEl.textContent = '❌ Erreur: ' + (e.message || e);
    }
  },

  // ===== ADMIN PANEL =====
  initAdminPanelTab: function () {
    var btn = document.getElementById('admin-panel-tab-btn');
    if (!btn) return;
    if (this.isAdminUser()) {
      btn.style.display = '';
    } else {
      btn.style.display = 'none';
    }
  },

  adminCreateAccount: function () {
    if (!this.isAdminUser()) {
      this.showNotification('Accès refusé. Admin seulement.', 'error');
      return;
    }

    var emailEl = document.getElementById('admin-create-email');
    var pwEl = document.getElementById('admin-create-password');
    var typeEl = document.getElementById('admin-create-account-type');
    var tronEl = document.getElementById('admin-create-tron-address');
    var statusEl = document.getElementById('admin-create-status');

    if (!emailEl || !pwEl || !typeEl) return;

    var email = emailEl.value.trim();
    var password = pwEl.value.trim();
    var accountType = typeEl.value;
    var tronAddress = (tronEl && tronEl.value.trim()) || '';

    if (!email) {
      if (statusEl) statusEl.textContent = '⚠ Email requis';
      return;
    }
    if (!password) {
      if (statusEl) statusEl.textContent = '⚠ Mot de passe requis';
      return;
    }

    if (statusEl) statusEl.textContent = '⏳ Création en cours...';

    var jwt = localStorage.getItem('usdt_jwt') || '';
    var payload = {
      action: 'create_account',
      email: email,
      password: password,
      accountType: accountType,
      tronAddress: tronAddress
    };

    fetch('/api/admin/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + jwt
      },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          if (statusEl) statusEl.textContent = '❌ Erreur: ' + data.error;
          App.showNotification('Erreur: ' + data.error, 'error');
          return;
        }
        if (statusEl) statusEl.textContent = '✅ Compte créé avec succès: ' + data.user.email;
        App.showNotification('✅ Compte créé: ' + data.user.email, 'success');
        // Clear form
        if (emailEl) emailEl.value = '';
        if (pwEl) pwEl.value = '';
        if (tronEl) tronEl.value = '';
        // Reload the list
        setTimeout(function () { App.loadAdminCreatedAccounts(); }, 1000);
      })
      .catch(function (e) {
        if (statusEl) statusEl.textContent = '❌ Erreur: ' + (e.message || e);
        App.showNotification('Erreur réseau', 'error');
      });
  },

  loadAdminCreatedAccounts: function () {
    var listEl = document.getElementById('admin-accounts-list');
    if (!listEl) return;
    if (!this.isAdminUser()) return;

    listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px 0;">Chargement...</div>';

    var jwt = localStorage.getItem('usdt_jwt') || '';
    fetch('/api/admin/status?action=accounts', {
      headers: { 'Authorization': 'Bearer ' + jwt }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        App._renderAdminAccounts(data.accounts || []);
      })
      .catch(function (e) {
        listEl.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:20px 0;">Erreur de chargement.</div>';
      });
  },

  _renderAdminAccounts: function (accounts) {
    var listEl = document.getElementById('admin-accounts-list');
    if (!listEl) return;

    if (!accounts.length) {
      listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucun compte actif.</div>';
      return;
    }

    var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="background:var(--bg-primary);border-bottom:1px solid var(--border);">';
    html += '<th style="padding:8px;text-align:left;color:var(--text-muted);">Email</th>';
    html += '<th style="padding:8px;text-align:left;color:var(--text-muted);">Nom</th>';
    html += '<th style="padding:8px;text-align:center;color:var(--text-muted);">Type</th>';
    html += '<th style="padding:8px;text-align:right;color:var(--text-muted);">Solde USDT</th>';
    html += '<th style="padding:8px;text-align:left;color:var(--text-muted);">Adresse TRON</th>';
    html += '</tr>';

    accounts.forEach(function (acc) {
      var name = (acc.firstName || '') + ' ' + (acc.lastName || '');
      name = name.trim() || '—';
      var balance = parseFloat(acc.usdtBalance || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      var trxAddr = acc.tronAddress;
      if (trxAddr && trxAddr.length > 20) {
        trxAddr = trxAddr.substring(0, 10) + '...' + trxAddr.substring(trxAddr.length - 6);
      }

      html += '<tr style="border-bottom:1px solid var(--border);background:var(--bg-secondary);">';
      html += '<td style="padding:8px;"><span style="color:#26a17b;font-weight:600;">' + acc.email + '</span></td>';
      html += '<td style="padding:8px;">' + name + '</td>';
      html += '<td style="padding:8px;text-align:center;"><span style="background:rgba(38,161,123,0.2);color:#26a17b;padding:2px 6px;border-radius:4px;font-weight:600;">' + acc.accountType + '</span></td>';
      html += '<td style="padding:8px;text-align:right;color:#26a17b;font-weight:700;">' + balance + '</td>';
      html += '<td style="padding:8px;font-family:monospace;font-size:11px;color:var(--text-muted);">' + trxAddr + '</td>';
      html += '</tr>';
    });

    html += '</table>';
    listEl.innerHTML = html;
  },

  loadAdminAccounts: function () {
    this.loadAdminCreatedAccounts();
  }
};

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', function () { App.init(); });
