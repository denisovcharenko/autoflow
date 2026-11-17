import { setTimeout as delay } from 'node:timers/promises';
import { createInstagram } from './instagram.js';
import { createLinkedIn } from './linkedin.js';
import { createThreads } from './threads.js';

// Only platforms with a token are created, so a network can be added later
// without touching the rest of the flow.
export function createPublishers(env, sleep = delay) {
  const publishers = {};
  if (env.THREADS_ACCESS_TOKEN) {
    publishers.threads = createThreads({ token: env.THREADS_ACCESS_TOKEN, sleep });
  }
  if (env.INSTAGRAM_ACCESS_TOKEN) {
    publishers.instagram = createInstagram({ token: env.INSTAGRAM_ACCESS_TOKEN, sleep });
  }
  if (env.LINKEDIN_ACCESS_TOKEN) {
    publishers.linkedin = createLinkedIn({ token: env.LINKEDIN_ACCESS_TOKEN, sleep });
  }
  return publishers;
}
