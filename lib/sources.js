// Maps a "source" selected in the dashboard UI (hero / premia) to the
// Google Sheet ID it should read/write. Both sheets share the same tab name
// and column structure, so only the spreadsheet ID changes between them.

const SOURCES = {
  hero: {
    label: 'HERO',
    sheetIdEnv: 'GOOGLE_SHEET_ID_HERO',
    // Falls back to the original GOOGLE_SHEET_ID var so existing single-sheet
    // deployments keep working without renaming anything.
    fallbackEnv: 'GOOGLE_SHEET_ID',
  },
  premia: {
    label: 'PREMIA',
    sheetIdEnv: 'GOOGLE_SHEET_ID_PREMIA',
  },
};

function resolveSpreadsheetId(source) {
  const key = String(source || 'hero').toLowerCase();
  const cfg = SOURCES[key];
  if (!cfg) {
    throw new Error('Unknown source: ' + source);
  }
  const id = process.env[cfg.sheetIdEnv] || (cfg.fallbackEnv ? process.env[cfg.fallbackEnv] : null);
  if (!id) {
    throw new Error(
      `Missing environment variable ${cfg.sheetIdEnv} for source "${key}"`
    );
  }
  return id;
}

function isValidSource(source) {
  return Object.prototype.hasOwnProperty.call(SOURCES, String(source || '').toLowerCase());
}

module.exports = { resolveSpreadsheetId, isValidSource, SOURCES };
