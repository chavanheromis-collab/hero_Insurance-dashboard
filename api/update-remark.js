const { requireAuth } = require('../lib/auth');
const { getSheetsClient, colLetter } = require('../lib/sheets-client');
const { resolveSpreadsheetId, isValidSource } = require('../lib/sources');

const SHEET_NAME = process.env.SHEET_TAB_NAME || 'VEHICLES_BOT';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!requireAuth(req, res)) return;

  const { vin, rowHint, remark, source } = req.body || {};
  const src = String(source || 'hero').toLowerCase();

  if (!vin) {
    res.status(400).json({ error: 'VIN is required' });
    return;
  }
  if (!isValidSource(src)) {
    res.status(400).json({ error: 'Unknown source: ' + source });
    return;
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = resolveSpreadsheetId(src);

    // 1. Read headers to find the VIN and REMARK columns (case-insensitive,
    //    same as the old updateRemark() in Apps Script).
    const headerResult = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SHEET_NAME}!1:1`,
    });
    const headers = ((headerResult.data.values && headerResult.data.values[0]) || []).map((h) =>
      String(h).trim()
    );
    const vinCol = headers.findIndex((h) => h.toLowerCase() === 'vin');
    const remarkCol = headers.findIndex((h) => h.toLowerCase() === 'remark');

    if (vinCol === -1) {
      res.status(400).json({ error: 'VIN column not found in sheet' });
      return;
    }
    if (remarkCol === -1) {
      res.status(400).json({ error: 'REMARK column not found in sheet' });
      return;
    }

    let targetRow = 0;

    // 2. Try the row hint first (fast path) — re-verify the VIN still matches.
    if (rowHint) {
      const check = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!${colLetter(vinCol)}${rowHint}`,
      });
      const val = check.data.values && check.data.values[0] && check.data.values[0][0];
      if (String(val || '').trim() === String(vin).trim()) {
        targetRow = rowHint;
      }
    }

    // 3. Fall back to a full scan of the VIN column if the hint missed.
    if (!targetRow) {
      const vinColResult = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!${colLetter(vinCol)}2:${colLetter(vinCol)}`,
      });
      const vinValues = vinColResult.data.values || [];
      for (let i = 0; i < vinValues.length; i++) {
        if (String((vinValues[i] && vinValues[i][0]) || '').trim() === String(vin).trim()) {
          targetRow = i + 2;
          break;
        }
      }
    }

    if (!targetRow) {
      res.status(404).json({ error: 'VIN not found in sheet: ' + vin });
      return;
    }

    // 4. Write the remark.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!${colLetter(remarkCol)}${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[remark || '']] },
    });

    res.status(200).json({ success: true, row: targetRow, vin, remark: remark || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
