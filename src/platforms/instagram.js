import { request } from '../http.js';

const INSTAGRAM_BASE = 'https://graph.instagram.com/v26.0';
const FACEBOOK_BASE = 'https://graph.facebook.com/v26.0';
const STATUS_POLL_MS = 15_000;
const STATUS_MAX_POLLS = 20;

// Instagram Login tokens ("IG...") talk to graph.instagram.com. Unified login issues
// Facebook tokens ("EA..."), which reach the same account through graph.facebook.com.
export function createInstagram({ token, userId, sleep }) {
  const headers = { Authorization: `Bearer ${token}` };
  const viaFacebook = token.startsWith('EA');
  const BASE = viaFacebook ? FACEBOOK_BASE : INSTAGRAM_BASE;

  const getUser = async () => {
    if (!viaFacebook) {
      return (await request(`${BASE}/me?fields=user_id,username`, { headers })).data;
    }
    // A Unified login token can't always list its accounts, so the ID can be given directly.
    if (userId) {
      const { data } = await request(`${BASE}/${userId}?fields=id,username`, { headers });
      return { user_id: data.id, username: data.username };
    }
    const fields = encodeURIComponent('instagram_business_account{id,username}');
    const { data: pages } = await request(`${BASE}/me/accounts?fields=${fields}`, { headers });
    const account = pages.data?.find((page) => page.instagram_business_account)?.instagram_business_account;
    if (!account) {
      throw new Error('No Instagram account visible to this token; set the INSTAGRAM_USER_ID variable');
    }
    return { user_id: account.id, username: account.username };
  };

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
