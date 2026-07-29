const { createSessionToken } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.DASHBOARD_PASSWORD) {
    res.status(500).json({ error: 'Server not configured: DASHBOARD_PASSWORD is missing' });
    return;
  }

  const { password } = req.body || {};

  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    // Small delay to make brute-forcing the password slower.
    await new Promise((r) => setTimeout(r, 400));
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  const token = createSessionToken();
  res.status(200).json({ token });
};
