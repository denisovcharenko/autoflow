import { request } from '../http.js';

const BASE = 'https://api.linkedin.com';
const API_VERSION = '202610';
const IMAGE_PROCESSING_WAIT_MS = 5_000;

// Commentary uses LinkedIn's "little" text format: an unescaped reserved character can
// make LinkedIn drop part of the post. "#" stays as is so hashtags keep working.
export function escapeCommentary(text) {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, '\\$&');
}

export function createLinkedIn({ token, sleep }) {
  const auth = { Authorization: `Bearer ${token}` };
  const restHeaders = {
    ...auth,
    'Linkedin-Version': API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  };

  const getProfile = async () => (await request(`${BASE}/v2/userinfo`, { headers: auth })).data;

  const uploadImage = async (owner, imageUrl) => {
    const download = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
    if (!download.ok) throw new Error(`Could not download ${imageUrl}: HTTP ${download.status}`);
    const bytes = Buffer.from(await download.arrayBuffer());

    const { data } = await request(`${BASE}/rest/images?action=initializeUpload`, {
      method: 'POST',
      headers: restHeaders,
      json: { initializeUploadRequest: { owner } },
    });
    await request(data.value.uploadUrl, { method: 'PUT', headers: auth, body: bytes });
    return data.value.image;
  };

  return {
    async check() {
      return (await getProfile()).name;
    },

    async publish({ text, mediaUrls }) {
      const author = `urn:li:person:${(await getProfile()).sub}`;

      const images = [];
      for (const imageUrl of mediaUrls) {
        images.push(await uploadImage(author, imageUrl));
      }
      if (images.length) await sleep(IMAGE_PROCESSING_WAIT_MS);

      let content;
      if (images.length === 1) content = { media: { id: images[0] } };
      if (images.length > 1) content = { multiImage: { images: images.map((id) => ({ id })) } };

      const { headers } = await request(`${BASE}/rest/posts`, {
        method: 'POST',
        headers: restHeaders,
        json: {
          author,
          commentary: escapeCommentary(text),
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          ...(content && { content }),
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        },
      });
      return headers.get('x-restli-id');
    },
  };
}
