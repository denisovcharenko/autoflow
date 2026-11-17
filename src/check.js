import { createPublishers } from './platforms/index.js';
import { createSheetFromEnv } from './sheet.js';

let ok = true;

try {
  const sheet = await createSheetFromEnv(process.env);
  console.log(`Google Sheets: OK, ${(await sheet.read()).length} row(s)`);
} catch (error) {
  ok = false;
  console.log(`Google Sheets: FAILED, ${error.message}`);
}

const publishers = createPublishers(process.env);
for (const platform of ['threads', 'instagram', 'linkedin']) {
  if (!publishers[platform]) {
    console.log(`${platform}: no token`);
    continue;
  }
  try {
    console.log(`${platform}: OK, ${await publishers[platform].check()}`);
  } catch (error) {
    ok = false;
    console.log(`${platform}: FAILED, ${error.message}`);
    // Enough to spot a wrong paste (a URL, an app ID) without exposing the token.
    const token = process.env[`${platform.toUpperCase()}_ACCESS_TOKEN`].trim();
    console.log(`  token shape: ${token.length} characters, starts with "${token.slice(0, 2)}"`);
  }
}

if (!ok) process.exitCode = 1;
