import { setTimeout as delay } from 'node:timers/promises';
import { createInstagram } from './instagram.js';
import { createLinkedIn } from './linkedin.js';
import { createThreads } from './threads.js';

// Only platforms with a token are created, so a network can be added later
// without touching the rest of the flow.
export function createPublishers(env, sleep = delay) {
  // Tokens pasted from the clipboard often carry a trailing newline, which breaks them.
  const token = (name) => env[name]?.trim();
  const publishers = {};
  if (token('THREADS_ACCESS_TOKEN')) {
    publishers.threads = createThreads({ token: token('THREADS_ACCESS_TOKEN'), sleep });
  }
  if (token('INSTAGRAM_ACCESS_TOKEN')) {
    publishers.instagram = createInstagram({ token: token('INSTAGRAM_ACCESS_TOKEN'), userId: env.INSTAGRAM_USER_ID?.trim(), sleep });
  }
  if (token('LINKEDIN_ACCESS_TOKEN')) {
    publishers.linkedin = createLinkedIn({ token: token('LINKEDIN_ACCESS_TOKEN'), sleep });
  }
  return publishers;
}
