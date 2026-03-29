function readHeader(req, name) {
  const value = req && req.headers ? req.headers[name] : '';
  if (Array.isArray(value)) return String(value[0] || '');
  return typeof value === 'string' ? value : '';
}

function normalizeIp(ip) {
  const text = String(ip || '').trim();
  if (!text) return 'unknown';
  if (text.startsWith('::ffff:')) return text.slice(7);
  return text;
}

function getClientIp(req) {
  const xff = readHeader(req, 'x-forwarded-for');
  if (xff) {
    return normalizeIp(xff.split(',')[0].trim());
  }

  const realIp = readHeader(req, 'x-real-ip');
  if (realIp) return normalizeIp(realIp);

  const cfIp = readHeader(req, 'cf-connecting-ip');
  if (cfIp) return normalizeIp(cfIp);

  const remote = req && req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
  return normalizeIp(remote);
}

function getClientGeo(req) {
  const city =
    readHeader(req, 'x-vercel-ip-city') ||
    readHeader(req, 'x-appengine-city') ||
    '';

  const country =
    readHeader(req, 'x-vercel-ip-country') ||
    readHeader(req, 'x-appengine-country') ||
    '';

  const parts = [];
  if (city) parts.push(city);
  if (country) parts.push(country);

  return {
    city: city || 'Unknown',
    country: country || 'Unknown',
    location: parts.length ? parts.join(', ') : 'Unknown',
  };
}

module.exports = {
  getClientIp,
  getClientGeo,
};
