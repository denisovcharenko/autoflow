import { execFileSync } from 'node:child_process';
import { request } from './http.js';

// LinkedIn is not here: its tokens can't be refreshed this way and are reissued by hand.
const TOKENS = [
  {
    secret: 'THREADS_ACCESS_TOKEN',
    url: 'https://graph.threads.com/refresh_access_token',
    grantType: 'th_refresh_token',
  },
  {
    secret: 'INSTAGRAM_ACCESS_TOKEN',
    url: 'https://graph.instagram.com/refresh_access_token',
    grantType: 'ig_refresh_token',
  },
];

let ok = true;

for (const { secret, url, grantType } of TOKENS) {
  const token = process.env[secret];
  if (!token) {
    console.log(`${secret}: not set, skipped`);
    continue;
  }
  try {
    const query = new URLSearchParams({ grant_type: grantType, access_token: token });
    const { data } = await request(`${url}?${query}`);
    // Passed on stdin so the token never appears in a process list or log.
    execFileSync('gh', ['secret', 'set', secret], { input: data.access_token, stdio: ['pipe', 'ignore', 'inherit'] });
    console.log(`${secret}: refreshed, valid for ${Math.round(data.expires_in / 86400)} days`);
  } catch (error) {
    ok = false;
    console.log(`${secret}: FAILED, ${error.message}`);
  }
}

if (!ok) process.exitCode = 1;
