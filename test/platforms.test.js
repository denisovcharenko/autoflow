import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createInstagram } from '../src/platforms/instagram.js';
import { createLinkedIn, escapeCommentary } from '../src/platforms/linkedin.js';
import { createThreads } from '../src/platforms/threads.js';

const sleep = async () => {};
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Answers each request from the first route whose substring matches the URL.
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body, headers: init.headers });
    const route = routes.find(([match]) => String(url).includes(match));
    if (!route) throw new Error(`Unexpected request: ${url}`);
    const [, body, options] = route;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), options);
  };
  return calls;
}

test('threads publishes a single image in two steps', async () => {
  const calls = mockFetch([
    ['/me?', { id: '42', username: 'me' }],
    ['/42/threads_publish', { id: 'post-1' }],
    ['/42/threads', { id: 'container-1' }],
  ]);
  const id = await createThreads({ token: 'tok', sleep }).publish({ text: 'hi', mediaUrls: ['https://x/a.jpg'] });

  assert.equal(id, 'post-1');
  const container = Object.fromEntries(calls[1].body);
  assert.equal(container.media_type, 'IMAGE');
  assert.equal(container.image_url, 'https://x/a.jpg');
  assert.equal(container.text, 'hi');
  assert.equal(Object.fromEntries(calls[2].body).creation_id, 'container-1');
});

test('threads builds a carousel from item containers', async () => {
  let next = 0;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body });
    if (String(url).includes('/me?')) return Response.json({ id: '42' });
    return Response.json({ id: `c${++next}` });
  };
  await createThreads({ token: 'tok', sleep }).publish({ text: 'hi', mediaUrls: ['https://x/a.jpg', 'https://x/b.jpg'] });

  const carousel = Object.fromEntries(calls[3].body);
  assert.equal(carousel.media_type, 'CAROUSEL');
  assert.equal(carousel.children, 'c1,c2');
  assert.equal(Object.fromEntries(calls[4].body).creation_id, 'c3');
});

test('instagram waits for the container before publishing', async () => {
  const statuses = ['IN_PROGRESS', 'FINISHED'];
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: init.body });
    if (String(url).includes('/me?')) return Response.json({ user_id: '7', username: 'me' });
    if (String(url).includes('fields=status_code')) return Response.json({ status_code: statuses.shift() });
    if (String(url).includes('/media_publish')) return Response.json({ id: 'ig-1' });
    return Response.json({ id: 'container-1' });
  };
  const id = await createInstagram({ token: 'tok', sleep }).publish({ text: 'hi', mediaUrls: ['https://x/a.jpg'] });

  assert.equal(id, 'ig-1');
  assert.equal(statuses.length, 0);
  assert.deepEqual(JSON.parse(calls[1].body), { image_url: 'https://x/a.jpg', caption: 'hi' });
});

test('instagram stops when a container fails', async () => {
  mockFetch([
    ['/me?', { user_id: '7' }],
    ['fields=status_code', { status_code: 'ERROR' }],
    ['/7/media', { id: 'container-1' }],
  ]);
  await assert.rejects(
    createInstagram({ token: 'tok', sleep }).publish({ text: 'hi', mediaUrls: ['https://x/a.jpg'] }),
    /container is ERROR/,
  );
});

test('linkedin uploads an image and posts it as the member', async () => {
  const calls = mockFetch([
    ['/v2/userinfo', { sub: 'abc', name: 'Me' }],
    ['https://x/a.jpg', 'image-bytes'],
    ['initializeUpload', { value: { uploadUrl: 'https://upload.example/1', image: 'urn:li:image:1' } }],
    ['upload.example', ''],
    ['/rest/posts', '', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } }],
  ]);
  const id = await createLinkedIn({ token: 'tok', sleep }).publish({ text: 'Це (тест)', mediaUrls: ['https://x/a.jpg'] });

  assert.equal(id, 'urn:li:share:9');
  const init = calls.find((call) => call.url.includes('initializeUpload'));
  assert.equal(JSON.parse(init.body).initializeUploadRequest.owner, 'urn:li:person:abc');
  const upload = calls.find((call) => call.url.includes('upload.example'));
  assert.equal(upload.method, 'PUT');
  const post = JSON.parse(calls.find((call) => call.url.includes('/rest/posts')).body);
  assert.equal(post.author, 'urn:li:person:abc');
  assert.equal(post.commentary, 'Це \\(тест\\)');
  assert.deepEqual(post.content, { media: { id: 'urn:li:image:1' } });
});

test('linkedin sends a text-only post without content', async () => {
  const calls = mockFetch([
    ['/v2/userinfo', { sub: 'abc' }],
    ['/rest/posts', '', { status: 201, headers: { 'x-restli-id': 'urn:li:share:9' } }],
  ]);
  await createLinkedIn({ token: 'tok', sleep }).publish({ text: 'hi', mediaUrls: [] });
  assert.equal('content' in JSON.parse(calls.at(-1).body), false);
});

test('escapeCommentary escapes reserved characters but keeps hashtags', () => {
  assert.equal(escapeCommentary('a_b *c* @d [e] #tag'), 'a\\_b \\*c\\* \\@d \\[e\\] #tag');
});

test('errors do not leak the access token', async () => {
  globalThis.fetch = async () => new Response('{"error":"bad"}', { status: 400 });
  await assert.rejects(createThreads({ token: 'SECRET-TOKEN', sleep }).check(), (error) => {
    assert.match(error.message, /HTTP 400/);
    assert.doesNotMatch(error.message, /SECRET-TOKEN/);
    return true;
  });
});

test('instagram uses the Facebook graph for Unified login tokens', async () => {
  const calls = mockFetch([
    ['/me/accounts', { data: [{ id: 'page' }, { id: 'page2', instagram_business_account: { id: '9', username: 'me' } }] }],
  ]);
  const username = await createInstagram({ token: 'EAAtok', sleep }).check();

  assert.equal(username, 'me');
  assert.ok(calls[0].url.startsWith('https://graph.facebook.com/'));
});

test('instagram finds the account in token scopes when no Page is visible', async () => {
  mockFetch([
    ['/me/accounts', { data: [] }],
    ['/me?', {}],
    ['/debug_token', { data: { granular_scopes: [{ scope: 'instagram_content_publish', target_ids: ['17'] }] } }],
    ['/17?', { id: '17', username: 'me' }],
  ]);
  assert.equal(await createInstagram({ token: 'EAAtok', sleep }).check(), 'me');
});
