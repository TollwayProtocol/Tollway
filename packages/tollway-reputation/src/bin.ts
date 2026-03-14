/**
 * tollway-reputation CLI entry point.
 * Starts the reference reputation oracle server.
 *
 * Usage:
 *   npx @tollway/reputation
 *   PORT=4000 ORACLE_API_KEY=secret npx @tollway/reputation
 */

import { createOracleApp } from './index.js';

const port = parseInt(process.env.PORT ?? '3100', 10);
const apiKey = process.env.ORACLE_API_KEY;

const app = createOracleApp({ apiKey });

app.listen(port, () => {
  console.log(`[tollway-reputation] Oracle running on http://localhost:${port}`);
  console.log(`[tollway-reputation] Health: http://localhost:${port}/v1/health`);
  if (apiKey) {
    console.log('[tollway-reputation] Write endpoints require X-Oracle-Key header');
  } else {
    console.log('[tollway-reputation] Warning: no ORACLE_API_KEY set — write endpoints are open');
  }
});
