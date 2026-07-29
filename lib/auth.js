const crypto = require('crypto');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('Missing AUTH_SECRET environment variable');
  const body = base64url(Buffer.from(JSON.stringify(payload)));
  const sig = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

function verify(token) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expectedSig = base64url(crypto.createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

function createSessionToken() {
  return sign({ exp: Date.now() + TOKEN_TTL_MS });
}

// Returns true and lets the caller continue if authorized.
// Returns false and has already written a 401 response if not.
function requireAuth(req, res) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verify(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { createSessionToken, verify, requireAuth };
