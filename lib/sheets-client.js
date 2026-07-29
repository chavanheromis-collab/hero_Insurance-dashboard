const { google } = require('googleapis');

// A JWT client is reused across warm invocations of the same serverless
// function instance so we don't re-authenticate on every request.
let cachedClient = null;

function buildAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables'
    );
  }

  // Env vars store \n as the literal two characters "\" + "n" — convert them
  // back into real newlines for the PEM key to parse correctly.
  const key = rawKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const auth = buildAuth();
  await auth.authorize();
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

// Converts a 0-based column index into an A1-style column letter (0 -> "A", 27 -> "AB").
function colLetter(index0) {
  let idx = index0 + 1;
  let s = '';
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

module.exports = { getSheetsClient, colLetter };
