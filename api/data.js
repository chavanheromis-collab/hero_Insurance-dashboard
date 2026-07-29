const { requireAuth } = require('../lib/auth');
const { getSheetsClient } = require('../lib/sheets-client');
const { resolveSpreadsheetId, isValidSource } = require('../lib/sources');

const SHEET_NAME = process.env.SHEET_TAB_NAME || 'VEHICLES_BOT';
const CACHE_TTL_MS = 45 * 1000; // warm-instance cache only; see README note on caching

// Lives only for the lifetime of a warm serverless instance — not shared
// across all users/instances, but still cuts repeated-load latency a lot.
// Keyed by source ("hero" / "premia") so switching doesn't clobber the
// other sheet's cached copy.
let cache = {}; // { [source]: { data, ts } }

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!requireAuth(req, res)) return;

  const source = String((req.query && req.query.source) || 'hero').toLowerCase();
  if (!isValidSource(source)) {
    res.status(400).json({ error: 'Unknown source: ' + source });
    return;
  }

  try {
    const forceRefresh = req.query && req.query.refresh === '1';
    const cached = cache[source];

    if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      res.setHeader('X-Cache', 'HIT');
      res.status(200).json(cached.data);
      return;
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = resolveSpreadsheetId(source);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: SHEET_NAME,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    const values = result.data.values || [];

    if (values.length < 1) {
      const empty = { headers: [], rows: [], editableColumns: ['REMARK'] };
      cache[source] = { data: empty, ts: Date.now() };
      res.status(200).json(empty);
      return;
    }

    const headers = values[0].map((h) => String(h).trim());
    const lastCol = headers.length;

    // Compact array format (matches what the dashboard already expects):
    // each row is [col1, col2, ..., colN, sheetRowNumber]
    const rows = values
      .slice(1)
      .map((row, idx) => {
        const arr = new Array(lastCol + 1);
        for (let i = 0; i < lastCol; i++) {
          const v = row[i];
          arr[i] = v !== undefined && v !== null ? v : '';
        }
        arr[lastCol] = idx + 2; // header is row 1, so first data row is row 2
        return arr;
      })
      // Drop fully-blank trailing rows (mirrors the old "scan column A" logic)
      .filter((arr) => arr.slice(0, lastCol).some((v) => String(v).trim() !== ''));

    const payload = { headers, rows, editableColumns: ['REMARK'] };
    cache[source] = { data: payload, ts: Date.now() };

    res.setHeader('X-Cache', 'MISS');
    res.status(200).json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
