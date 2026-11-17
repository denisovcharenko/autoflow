import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePublishAt, resolveMediaUrl, threadsLength, validateRow } from '../src/validate.js';

const validRow = {
  platforms: 'threads, instagram, linkedin',
  media: 'media/a.jpg',
  threads_text: 'т',
  instagram_text: 'і',
  linkedin_text: 'л',
};

test('parsePublishAt converts Kyiv time to UTC across seasons', () => {
  assert.equal(parsePublishAt('2026-11-10 10:00', 'Europe/Kyiv').toISOString(), '2026-11-10T08:00:00.000Z');
  assert.equal(parsePublishAt('2026-07-10 10:00', 'Europe/Kyiv').toISOString(), '2026-07-10T07:00:00.000Z');
});

test('parsePublishAt accepts the dotted format Sheets may display', () => {
  assert.equal(parsePublishAt('10.11.2026 10:00', 'Europe/Kyiv').toISOString(), '2026-11-10T08:00:00.000Z');
});

test('parsePublishAt rejects ambiguous and impossible dates', () => {
  assert.throws(() => parsePublishAt('11/10/2026 10:00', 'Europe/Kyiv'));
  assert.throws(() => parsePublishAt('2026-02-31 10:00', 'Europe/Kyiv'));
  assert.throws(() => parsePublishAt('2026-11-10 25:00', 'Europe/Kyiv'));
  assert.throws(() => parsePublishAt('', 'Europe/Kyiv'));
});

test('threadsLength counts emoji by bytes and Cyrillic as one character', () => {
  assert.equal(threadsLength('дизайн'), 6);
  assert.equal(threadsLength('🎨'), 4);
});

test('validateRow accepts a correct row', () => {
  assert.deepEqual(validateRow(validRow).problems, []);
});

test('validateRow catches content problems', () => {
  const problems = (overrides) => validateRow({ ...validRow, ...overrides }).problems.join('; ');
  assert.match(problems({ media: 'media/a.png' }), /instagram can't use/);
  assert.match(problems({ media: '' }), /instagram requires an image/);
  assert.match(problems({ media: 'media/clip.mp4' }), /threads can't use/);
  assert.match(problems({ threads_text: 'a'.repeat(501) }), /limit is 500/);
  assert.match(problems({ linkedin_text: '' }), /linkedin_text is empty/);
  assert.match(problems({ platforms: 'tiktok' }), /unknown platform/);
  assert.match(problems({ platforms: '' }), /platforms is empty/);
  assert.match(problems({ platforms: 'threads, threads' }), /duplicates/);
});

test('validateRow allows a text-only post where the network supports it', () => {
  const { problems } = validateRow({ ...validRow, platforms: 'threads, linkedin', media: '' });
  assert.deepEqual(problems, []);
});

test('resolveMediaUrl builds an encoded URL and keeps full URLs', () => {
  assert.equal(
    resolveMediaUrl('media/моя робота.jpg', 'https://me.github.io/repo/'),
    'https://me.github.io/repo/media/%D0%BC%D0%BE%D1%8F%20%D1%80%D0%BE%D0%B1%D0%BE%D1%82%D0%B0.jpg',
  );
  assert.equal(resolveMediaUrl('https://x.com/a.jpg', 'https://me.github.io'), 'https://x.com/a.jpg');
});
