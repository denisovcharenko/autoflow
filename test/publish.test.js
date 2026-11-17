import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runOnce } from '../src/publish.js';

const NOW = new Date('2026-11-10T09:00:00Z');

function makeRow(overrides = {}) {
  return {
    id: 'post-1',
    status: 'approved',
    publish_at: '2026-11-10 10:00',
    platforms: 'threads, instagram',
    media: 'media/a.jpg',
    threads_text: 'thread',
    instagram_text: 'caption',
    linkedin_text: '',
    results: '',
    ...overrides,
  };
}

function fakeSheet(rows) {
  const updates = [];
  return {
    rows,
    updates,
    read: async () => rows,
    update: async (id, fields) => {
      updates.push({ id, ...fields });
      Object.assign(rows.find((row) => row.id === id), fields);
    },
  };
}

function fakePublisher(calls, name, { fails = false } = {}) {
  return {
    publish: async (post) => {
      calls.push({ name, ...post });
      if (fails) throw new Error('boom');
      return `${name}-id`;
    },
  };
}

function run(sheet, publishers, overrides = {}) {
  return runOnce({
    sheet,
    publishers,
    now: NOW,
    mediaBaseUrl: 'https://me.github.io/repo',
    checkMedia: async () => {},
    log: () => {},
    ...overrides,
  });
}

test('publishes a due post to every platform and records the result', async () => {
  const calls = [];
  const sheet = fakeSheet([makeRow()]);
  const ok = await run(sheet, {
    threads: fakePublisher(calls, 'threads'),
    instagram: fakePublisher(calls, 'instagram'),
  });

  assert.equal(ok, true);
  assert.deepEqual(calls.map((call) => call.name), ['threads', 'instagram']);
  assert.equal(calls[0].text, 'thread');
  assert.deepEqual(calls[0].mediaUrls, ['https://me.github.io/repo/media/a.jpg']);
  assert.equal(sheet.rows[0].status, 'published');
  assert.deepEqual(JSON.parse(sheet.rows[0].results), { threads: 'threads-id', instagram: 'instagram-id' });
  assert.equal(sheet.updates[0].status, 'publishing');
});

test('ignores posts that are not approved or not due yet', async () => {
  const calls = [];
  const sheet = fakeSheet([
    makeRow({ id: 'draft', status: 'draft' }),
    makeRow({ id: 'later', publish_at: '2026-11-10 11:30' }),
  ]);
  const ok = await run(sheet, { threads: fakePublisher(calls, 'threads'), instagram: fakePublisher(calls, 'instagram') });

  assert.equal(ok, true);
  assert.equal(calls.length, 0);
  assert.equal(sheet.updates.length, 0);
});

test('publishes only the oldest due post per run', async () => {
  const calls = [];
  const sheet = fakeSheet([
    makeRow({ id: 'newer', publish_at: '2026-11-10 10:30', platforms: 'threads' }),
    makeRow({ id: 'older', publish_at: '2026-11-10 09:00', platforms: 'threads' }),
  ]);
  await run(sheet, { threads: fakePublisher(calls, 'threads') });

  assert.equal(calls.length, 1);
  assert.equal(sheet.rows.find((row) => row.id === 'older').status, 'published');
  assert.equal(sheet.rows.find((row) => row.id === 'newer').status, 'approved');
});

test('a partial failure keeps what succeeded and a retry does not repost it', async () => {
  const calls = [];
  const sheet = fakeSheet([makeRow()]);
  const ok = await run(sheet, {
    threads: fakePublisher(calls, 'threads'),
    instagram: fakePublisher(calls, 'instagram', { fails: true }),
  });

  assert.equal(ok, false);
  assert.equal(sheet.rows[0].status, 'failed');
  assert.match(sheet.rows[0].error, /instagram: boom/);
  assert.deepEqual(JSON.parse(sheet.rows[0].results), { threads: 'threads-id' });

  sheet.rows[0].status = 'approved';
  calls.length = 0;
  const retried = await run(sheet, {
    threads: fakePublisher(calls, 'threads'),
    instagram: fakePublisher(calls, 'instagram'),
  });

  assert.equal(retried, true);
  assert.deepEqual(calls.map((call) => call.name), ['instagram']);
  assert.equal(sheet.rows[0].status, 'published');
  assert.equal(sheet.rows[0].error, '');
});

test('a run that dies after posting leaves the row out of the queue', async () => {
  const calls = [];
  const sheet = fakeSheet([makeRow({ platforms: 'threads' })]);
  const originalUpdate = sheet.update;
  sheet.update = async (id, fields) => {
    if (fields.results) throw new Error('Sheets is down');
    return originalUpdate(id, fields);
  };
  const publishers = { threads: fakePublisher(calls, 'threads') };

  await assert.rejects(run(sheet, publishers), /Sheets is down/);
  assert.equal(calls.length, 1);
  assert.equal(sheet.rows[0].status, 'publishing');

  await run(sheet, publishers);
  assert.equal(calls.length, 1);
});

test('invalid content fails before anything is posted', async () => {
  const calls = [];
  const sheet = fakeSheet([makeRow({ media: 'media/a.png' })]);
  const ok = await run(sheet, {
    threads: fakePublisher(calls, 'threads'),
    instagram: fakePublisher(calls, 'instagram'),
  });

  assert.equal(ok, false);
  assert.equal(calls.length, 0);
  assert.equal(sheet.rows[0].status, 'failed');
  assert.match(sheet.rows[0].error, /instagram can't use/);
});

test('unreachable media fails before anything is posted', async () => {
  const calls = [];
  const sheet = fakeSheet([makeRow()]);
  const ok = await run(
    sheet,
    { threads: fakePublisher(calls, 'threads'), instagram: fakePublisher(calls, 'instagram') },
    {
      checkMedia: async () => {
        throw new Error('media is not reachable');
      },
    },
  );

  assert.equal(ok, false);
  assert.equal(calls.length, 0);
  assert.match(sheet.rows[0].error, /not reachable/);
});

test('a missing token fails the row with a clear message', async () => {
  const sheet = fakeSheet([makeRow({ platforms: 'threads' })]);
  const ok = await run(sheet, {});

  assert.equal(ok, false);
  assert.match(sheet.rows[0].error, /no access token configured for threads/);
});

test('a bad publish_at marks only that row as failed', async () => {
  const calls = [];
  const sheet = fakeSheet([makeRow({ publish_at: 'завтра', platforms: 'threads' })]);
  const ok = await run(sheet, { threads: fakePublisher(calls, 'threads') });

  assert.equal(ok, false);
  assert.equal(calls.length, 0);
  assert.equal(sheet.rows[0].status, 'failed');
});

test('duplicate ids stop the run', async () => {
  const sheet = fakeSheet([makeRow(), makeRow()]);
  await assert.rejects(run(sheet, {}), /Duplicate ids/);
});

test('dry run changes nothing', async () => {
  const calls = [];
  const logs = [];
  const sheet = fakeSheet([makeRow()]);
  const ok = await run(
    sheet,
    { threads: fakePublisher(calls, 'threads'), instagram: fakePublisher(calls, 'instagram') },
    { dryRun: true, log: (line) => logs.push(line) },
  );

  assert.equal(ok, true);
  assert.equal(calls.length, 0);
  assert.equal(sheet.updates.length, 0);
  assert.match(logs.join('\n'), /would publish to threads, instagram with 1 image/);
});
