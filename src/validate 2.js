const RULES = {
  threads: { maxText: 500, formats: ['jpg', 'jpeg', 'png'], requiresMedia: false, formatHint: 'JPG or PNG' },
  instagram: { maxText: 2200, formats: ['jpg', 'jpeg'], requiresMedia: true, formatHint: 'JPG only' },
  linkedin: { maxText: 3000, formats: ['jpg', 'jpeg', 'png', 'gif'], requiresMedia: false, formatHint: 'JPG, PNG or GIF' },
};

const MAX_MEDIA = 20;

export const PLATFORMS = Object.keys(RULES);

// Accepts "2026-11-10 10:00" and "10.11.2026 10:00", because Google Sheets can
// re-display a typed date in the account's locale. Anything ambiguous is rejected.
export function parsePublishAt(value, timeZone) {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),? (\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!iso && !dotted) {
    throw new Error(`publish_at "${value}" must look like 2026-11-10 10:00`);
  }
  const [year, month, day, hour, minute] = iso
    ? iso.slice(1).map(Number)
    : [dotted[3], dotted[2], dotted[1], dotted[4], dotted[5]].map(Number);

  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallClock);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    throw new Error(`publish_at "${value}" is not a real date`);
  }

  const offsetAt = (timestamp) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(new Date(timestamp));
    const get = (type) => Number(parts.find((part) => part.type === type).value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - timestamp;
  };

  // Second pass handles the rare case where the guess lands across a DST change.
  const firstGuess = wallClock - offsetAt(wallClock);
  return new Date(wallClock - offsetAt(firstGuess));
}

export function parseList(value) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extensionOf(path) {
  const pathname = /^https?:/.test(path) ? new URL(path).pathname : path;
  return pathname.split('.').pop().toLowerCase();
}

// Threads counts each emoji by its UTF-8 byte length rather than as one character.
export function threadsLength(text) {
  let length = 0;
  for (const char of text) {
    length += /\p{Extended_Pictographic}/u.test(char) ? Buffer.byteLength(char) : 1;
  }
  return length;
}

function textLength(platform, text) {
  return platform === 'threads' ? threadsLength(text) : [...text].length;
}

// Returns all problems at once, before anything is posted, so a post can't fail
// halfway through its platforms because of bad content.
export function validateRow(row) {
  const problems = [];
  const platforms = parseList(row.platforms).map((platform) => platform.toLowerCase());
  const media = parseList(row.media);

  if (!platforms.length) problems.push('platforms is empty');
  if (new Set(platforms).size !== platforms.length) problems.push('platforms contains duplicates');
  if (media.length > MAX_MEDIA) problems.push(`media has ${media.length} files, the limit is ${MAX_MEDIA}`);

  for (const platform of platforms) {
    const rules = RULES[platform];
    if (!rules) {
      problems.push(`unknown platform "${platform}"`);
      continue;
    }
    const text = row[`${platform}_text`] ?? '';
    if (!text) problems.push(`${platform}_text is empty`);
    const length = textLength(platform, text);
    if (length > rules.maxText) {
      problems.push(`${platform}_text is ${length} characters, the limit is ${rules.maxText}`);
    }
    if (rules.requiresMedia && !media.length) problems.push(`${platform} requires an image`);
    for (const file of media) {
      if (!rules.formats.includes(extensionOf(file))) {
        problems.push(`${platform} can't use "${file}" (${rules.formatHint})`);
      }
    }
  }

  return { platforms, media, problems };
}

export function resolveMediaUrl(path, baseUrl) {
  if (/^https?:\/\//.test(path)) return path;
  if (!baseUrl) throw new Error('MEDIA_BASE_URL is not set');
  const encoded = path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/${encoded}`;
}
