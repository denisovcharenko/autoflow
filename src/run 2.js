import { createPublishers } from './platforms/index.js';
import { runOnce } from './publish.js';
import { createSheetFromEnv } from './sheet.js';

const ok = await runOnce({
  sheet: await createSheetFromEnv(process.env),
  publishers: createPublishers(process.env),
  timeZone: process.env.TIMEZONE || 'Europe/Kyiv',
  mediaBaseUrl: process.env.MEDIA_BASE_URL,
  dryRun: process.argv.includes('--dry-run'),
});

// A non-zero exit makes the GitHub run fail, and GitHub emails about failed runs.
if (!ok) process.exitCode = 1;
