(function () {
  var TRACK_ENDPOINT = '/api/telegram/track';
  var SESSION_KEY = 'usdt_visit_session_id';
  var LAST_SENT_KEY = 'usdt_last_track_sent';

  function getSessionId() {
    var existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    var sid = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(SESSION_KEY, sid);
    return sid;
  }

  function getUserContext() {
    var token = localStorage.getItem('usdt_jwt');
    var userData;
    try {
      userData = JSON.parse(localStorage.getItem('usdt_user') || '{}');
    } catch (e) {
      userData = {};
    }

    var userId = 'guest';
    if (token) {
      try {
        var payload = JSON.parse(atob(token.split('.')[1] || ''));
        if (payload && payload.id) userId = payload.id;
      } catch (e) {}
    }

    return {
      userId: userId,
      email: userData && userData.email ? String(userData.email) : '',
      wallet: userData && userData.tronAddress ? String(userData.tronAddress) : '',
    };
  }

  function shouldSendKey(eventType, page, action) {
    var key = eventType + '|' + page + '|' + (action || '');
    var now = Date.now();
    var data;
    try {
      data = JSON.parse(sessionStorage.getItem(LAST_SENT_KEY) || '{}');
    } catch (e) {
      data = {};
    }
    if (data[key] && now - data[key] < 1500) {
      return false;
    }
    data[key] = now;
    sessionStorage.setItem(LAST_SENT_KEY, JSON.stringify(data));
    return true;
  }

  function sendEvent(eventType, action, details) {
    var page = window.location.pathname + window.location.search;
    if (!shouldSendKey(eventType, page, action)) return;

    var ctx = getUserContext();
    var payload = {
      eventType: eventType,
      page: page,
      action: action || '',
      details: details || '',
      sessionId: getSessionId(),
      userId: ctx.userId,
      email: ctx.email,
      wallet: ctx.wallet,
    };

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(TRACK_ENDPOINT, blob);
      } else {
        fetch(TRACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function trackPageView() {
    sendEvent('page_view', 'open_page', document.title || 'Untitled');
  }

  function trackClicks() {
    document.addEventListener('click', function (evt) {
      var target = evt.target;
      if (!target) return;
      var el = target.closest('button, a, [data-track]');
      if (!el) return;

      var action = el.getAttribute('id') || el.getAttribute('data-track') || el.textContent || el.tagName;
      action = String(action).trim().replace(/\s+/g, ' ').slice(0, 120);
      if (!action) action = el.tagName.toLowerCase();

      var details = (el.tagName.toLowerCase() + (el.getAttribute('href') ? ':' + el.getAttribute('href') : '')).slice(0, 280);
      sendEvent('click', action, details);
    });
  }

  function trackForms() {
    document.addEventListener('submit', function (evt) {
      var form = evt.target;
      if (!form || !form.tagName || form.tagName.toLowerCase() !== 'form') return;
      var action = form.getAttribute('id') || form.getAttribute('name') || 'form_submit';
      sendEvent('form_submit', action, window.location.pathname);
    });
  }

  function trackErrors() {
    window.addEventListener('error', function (evt) {
      var message = (evt && evt.message) ? String(evt.message) : 'Unknown JS error';
      sendEvent('js_error', 'window_error', message.slice(0, 280));
    });
  }

  window.USDTTracker = {
    trackAction: function (action, details) {
      sendEvent('wallet_action', action || 'manual_action', details || '');
    },
    trackAuth: function (action, details) {
      sendEvent('auth_action', action || 'auth_action', details || '');
    },
  };

  trackPageView();
  trackClicks();
  trackForms();
  trackErrors();
})();
