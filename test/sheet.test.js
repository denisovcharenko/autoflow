import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLUMNS, createSheet } from '../src/sheet.js';

function fakeClient(values) {
  const requests = [];
  return {
    requests,
    request: async (options) => {
      requests.push(options);
      return { data: options.method === 'POST' ? {} : { values } };
    },
  };
}

test('read maps rows by header and fills in trailing blanks', async () => {
  const client = fakeClient([COLUMNS, ['a', 'approved']]);
  const [row] = await createSheet({ client, spreadsheetId: 'id' }).read();

  assert.equal(row.id, 'a');
  assert.equal(row.status, 'approved');
  assert.equal(row.error, '');
  assert.equal(row.rowNumber, 2);
});

test('read fails clearly when a column is missing', async () => {
  const client = fakeClient([['id', 'status']]);
  await assert.rejects(createSheet({ client, spreadsheetId: 'id' }).read(), /missing columns/);
});

test('update writes to the row found by id, even after columns move', async () => {
  const header = ['status', ...COLUMNS.filter((column) => column !== 'status')];
  const client = fakeClient([header, ['draft', 'a'], ['draft', 'b']]);
  await createSheet({ client, spreadsheetId: 'id' }).update('b', { status: 'published' });

  const { data } = client.requests.at(-1);
  assert.equal(data.valueInputOption, 'RAW');
  assert.deepEqual(data.data, [{ range: "'Queue'!A3", values: [['published']] }]);
});

test('update refuses an unknown id', async () => {
  const client = fakeClient([COLUMNS, ['a']]);
  await assert.rejects(createSheet({ client, spreadsheetId: 'id' }).update('b', { status: 'x' }), /exactly one row/);
});
