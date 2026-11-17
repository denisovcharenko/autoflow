import { parsePublishAt, resolveMediaUrl, validateRow } from './validate.js';

export async function checkMediaUrl(url) {
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`media is not reachable: ${url} (HTTP ${response.status})`);
}

function parseResults(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('results column is not valid JSON');
  }
}

function findDueRows(rows, now, timeZone) {
  const due = [];
  const invalid = [];
  for (const row of rows) {
    if (row.status.toLowerCase() !== 'approved') continue;
    try {
      const publishAt = parsePublishAt(row.publish_at, timeZone);
      if (publishAt <= now) due.push({ row, publishAt });
    } catch (error) {
      invalid.push({ row, error });
    }
  }
  due.sort((a, b) => a.publishAt - b.publishAt);
  return { due: due.map(({ row }) => row), invalid };
}

async function publishRow({ row, sheet, publishers, mediaBaseUrl, checkMedia, dryRun, log }) {
  const { platforms, media, problems } = validateRow(row);
  let results;
  try {
    results = parseResults(row.results);
  } catch (error) {
    problems.push(error.message);
  }
  for (const platform of platforms) {
    if (!publishers[platform] && !results?.[platform]) {
      problems.push(`no access token configured for ${platform}`);
    }
  }

  let mediaUrls = [];
  if (!problems.length) {
    try {
      mediaUrls = media.map((path) => resolveMediaUrl(path, mediaBaseUrl));
      await Promise.all(mediaUrls.map(checkMedia));
    } catch (error) {
      problems.push(error.message);
    }
  }

  if (problems.length) {
    const error = problems.join('; ');
    log(`${row.id}: not valid: ${error}`);
    if (!dryRun) await sheet.update(row.id, { status: 'failed', error });
    return false;
  }

  const pending = platforms.filter((platform) => !results[platform]);
  if (dryRun) {
    log(`${row.id}: would publish to ${pending.join(', ')} with ${mediaUrls.length} image(s)`);
    return true;
  }

  // "publishing" is set first: if the run dies mid-way, the row stays out of the queue
  // instead of being posted twice by the next run.
  await sheet.update(row.id, { status: 'publishing', error: '' });

  const errors = [];
  for (const platform of pending) {
    try {
      const text = row[`${platform}_text`];
      results[platform] = await publishers[platform].publish({ text, mediaUrls });
      log(`${row.id}: published to ${platform}`);
    } catch (error) {
      log(`${row.id}: ${platform} failed: ${error.message}`);
      errors.push(`${platform}: ${error.message}`);
      continue;
    }
    // Outside the try on purpose: if this write fails, the run stops with the row still
    // "publishing". Marking it "failed" would invite a retry that posts a duplicate.
    await sheet.update(row.id, { results: JSON.stringify(results) });
  }

  if (errors.length) {
    await sheet.update(row.id, { status: 'failed', error: errors.join('; ') });
    return false;
  }
  await sheet.update(row.id, { status: 'published', published_at: new Date().toISOString() });
  return true;
}

// One post per run keeps a backlog from flooding followers after an outage.
export async function runOnce({
  sheet,
  publishers,
  now = new Date(),
  timeZone = 'Europe/Kyiv',
  mediaBaseUrl,
  checkMedia = checkMediaUrl,
  dryRun = false,
  log = console.log,
}) {
  const rows = await sheet.read();

  const ids = rows.map((row) => row.id).filter(Boolean);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) {
    throw new Error(`Duplicate ids in the sheet: ${duplicates.join(', ')}`);
  }
  const withoutId = rows.filter((row) => !row.id && row.status.toLowerCase() === 'approved');
  if (withoutId.length) {
    throw new Error(`Approved rows without an id: ${withoutId.map((row) => row.rowNumber).join(', ')}`);
  }

  const { due, invalid } = findDueRows(rows, now, timeZone);
  let ok = true;

  for (const { row, error } of invalid) {
    log(`${row.id}: ${error.message}`);
    ok = false;
    if (!dryRun) await sheet.update(row.id, { status: 'failed', error: error.message });
  }

  if (!due.length) {
    log('Nothing due.');
    return ok;
  }

  const rowsToPublish = dryRun ? due : due.slice(0, 1);
  for (const row of rowsToPublish) {
    const published = await publishRow({ row, sheet, publishers, mediaBaseUrl, checkMedia, dryRun, log });
    ok = ok && published;
  }
  return ok;
}
