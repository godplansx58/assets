const { sendTrackingSummary, sendTrackingEvent } = require('./telegram');

const FLUSH_INTERVAL_MS = 30000;
const MAX_QUEUE = 500;

if (!global.__usdtTrackingAgg) {
  global.__usdtTrackingAgg = {
    queue: [],
    timer: null,
  };
}

const state = global.__usdtTrackingAgg;

function compactEvents(events) {
  const grouped = {};

  for (const e of events) {
    const key = [e.eventType, e.page, e.action || ''].join('|');
    if (!grouped[key]) {
      grouped[key] = {
        eventType: e.eventType,
        page: e.page,
        action: e.action || '',
        count: 0,
        users: new Set(),
      };
    }
    grouped[key].count += 1;
    grouped[key].users.add(e.email || e.userId || 'guest');
  }

  return Object.values(grouped)
    .map((item) => ({
      eventType: item.eventType,
      page: item.page,
      action: item.action,
      count: item.count,
      users: Array.from(item.users).slice(0, 4),
      uniqueUsers: item.users.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

async function flushNow() {
  if (!state.queue.length) return;

  const events = state.queue.splice(0, state.queue.length);
  const compact = compactEvents(events);

  try {
    await sendTrackingSummary({
      totalEvents: events.length,
      startTs: events[0].ts,
      endTs: events[events.length - 1].ts,
      compact,
    });
  } catch (err) {
    console.error('tracking summary send error:', err);
  }
}

function scheduleFlush() {
  if (state.timer) return;
  state.timer = setTimeout(async () => {
    state.timer = null;
    await flushNow();
  }, FLUSH_INTERVAL_MS);
}

function getQueueStats() {
  return {
    queueLength: state.queue.length,
    hasTimer: Boolean(state.timer),
  };
}

async function queueTrackingEvent(event) {
  if (event.eventType === 'js_error' || event.eventType === 'auth_action') {
    await sendTrackingEvent(event);
    return;
  }

  state.queue.push(event);
  if (state.queue.length > MAX_QUEUE) {
    state.queue.shift();
  }
  scheduleFlush();
}

module.exports = {
  queueTrackingEvent,
  flushNow,
  getQueueStats,
};
