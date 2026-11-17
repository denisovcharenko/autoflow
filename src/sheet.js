import { JWT } from 'google-auth-library';

export const COLUMNS = [
  'id',
  'status',
  'publish_at',
  'platforms',
  'media',
  'idea',
  'threads_text',
  'instagram_text',
  'linkedin_text',
  'published_at',
  'results',
  'error',
];

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

function columnLetter(index) {
  let letter = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

export function createSheet({ client, spreadsheetId, tab = 'Queue' }) {
  const base = `${API}/${spreadsheetId}/values`;

  async function readGrid() {
    const url = `${base}/${encodeURIComponent(`'${tab}'`)}`;
    const { data } = await client.request({ url });
    const [header = [], ...values] = data.values ?? [];
    const missing = COLUMNS.filter((column) => !header.includes(column));
    if (missing.length) {
      throw new Error(`Sheet "${tab}" is missing columns: ${missing.join(', ')}`);
    }
    const rows = values.map((cells, index) => {
      const row = { rowNumber: index + 2 };
      header.forEach((column, i) => {
        row[column] = String(cells[i] ?? '').trim();
      });
      return row;
    });
    return { header, rows };
  }

  return {
    async read() {
      return (await readGrid()).rows;
    },

    // Looks the row up by id on every write, so sorting or inserting rows
    // while a post is publishing cannot overwrite the wrong row.
    async update(id, fields) {
      const { header, rows } = await readGrid();
      const matches = rows.filter((row) => row.id === id);
      if (matches.length !== 1) {
        throw new Error(`Expected exactly one row with id "${id}", found ${matches.length}`);
      }
      const data = Object.entries(fields).map(([column, value]) => ({
        range: `'${tab}'!${columnLetter(header.indexOf(column))}${matches[0].rowNumber}`,
        values: [[value]],
      }));
      await client.request({
        url: `${base}:batchUpdate`,
        method: 'POST',
        data: { valueInputOption: 'RAW', data },
      });
    },
  };
}

export async function createSheetFromEnv(env) {
  if (!env.GOOGLE_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not set');
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const { client_email: email, private_key: key } = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const client = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  return createSheet({ client, spreadsheetId: env.GOOGLE_SHEET_ID });
}
