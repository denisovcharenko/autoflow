import { request } from '../http.js';

const BASE = 'https://graph.instagram.com/v26.0';
const STATUS_POLL_MS = 15_000;
const STATUS_MAX_POLLS = 20;

export function createInstagram({ token, sleep }) {
  const headers = { Authorization: `Bearer ${token}` };

  const getUser = async () => (await request(`${BASE}/me?fields=user_id,username`, { headers })).data;

  const waitUntilReady = async (containerId) => {
    for (let poll = 0; poll < STATUS_MAX_POLLS; poll++) {
      const { data } = await request(`${BASE}/${containerId}?fields=status_code`, { headers });
      if (data.status_code === 'FINISHED') return;
      if (data.status_code !== 'IN_PROGRESS') {
        throw new Error(`Instagram container is ${data.status_code}`);
      }
      await sleep(STATUS_POLL_MS);
    }
    throw new Error('Instagram container was still processing after 5 minutes');
  };

  return {
    async check() {
      return (await getUser()).username;
    },

    async publish({ text, mediaUrls }) {
      const { user_id: userId } = await getUser();
      const createContainer = async (json) => {
        const { data } = await request(`${BASE}/${userId}/media`, { method: 'POST', headers, json });
        return data.id;
      };

      let containerId;
      if (mediaUrls.length === 1) {
        containerId = await createContainer({ image_url: mediaUrls[0], caption: text });
      } else {
        const children = [];
        for (const imageUrl of mediaUrls) {
          const child = await createContainer({ image_url: imageUrl, is_carousel_item: true });
          await waitUntilReady(child);
          children.push(child);
        }
        containerId = await createContainer({
          media_type: 'CAROUSEL',
          children: children.join(','),
          caption: text,
        });
      }

      await waitUntilReady(containerId);
      const { data } = await request(`${BASE}/${userId}/media_publish`, {
        method: 'POST',
        headers,
        json: { creation_id: containerId },
      });
      return data.id;
    },
  };
}
