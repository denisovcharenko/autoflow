import { request } from '../http.js';

const BASE = 'https://graph.threads.com/v1.0';
const PROCESSING_WAIT_MS = 30_000;

export function createThreads({ token, sleep }) {
  const post = async (path, params) => {
    const { data } = await request(`${BASE}/${path}`, {
      method: 'POST',
      form: { ...params, access_token: token },
    });
    return data.id;
  };

  const getUser = async () => {
    const url = `${BASE}/me?fields=id,username&access_token=${encodeURIComponent(token)}`;
    return (await request(url)).data;
  };

  return {
    async check() {
      return (await getUser()).username;
    },

    async publish({ text, mediaUrls }) {
      const { id: userId } = await getUser();
      const createContainer = (params) => post(`${userId}/threads`, params);

      let containerId;
      if (mediaUrls.length === 0) {
        containerId = await createContainer({ media_type: 'TEXT', text });
      } else if (mediaUrls.length === 1) {
        containerId = await createContainer({ media_type: 'IMAGE', image_url: mediaUrls[0], text });
      } else {
        const children = [];
        for (const imageUrl of mediaUrls) {
          children.push(
            await createContainer({ media_type: 'IMAGE', image_url: imageUrl, is_carousel_item: 'true' }),
          );
        }
        await sleep(PROCESSING_WAIT_MS);
        containerId = await createContainer({
          media_type: 'CAROUSEL',
          children: children.join(','),
          text,
        });
      }

      // Meta recommends waiting about 30 seconds before publishing a container.
      await sleep(PROCESSING_WAIT_MS);
      return post(`${userId}/threads_publish`, { creation_id: containerId });
    },
  };
}
