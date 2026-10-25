import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Removed sources must never survive as stale published modules.
await rm(fileURLToPath(new URL('../dist/', import.meta.url)), { recursive: true, force: true });
