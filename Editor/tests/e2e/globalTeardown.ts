/**
 * E2E global teardown: if we started the dev server in globalSetup, stop it.
 */
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PID_FILE = join(process.cwd(), '.e2e-dev-server-pid');

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    return;
  }
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8'), 10);
    if (Number.isInteger(pid)) {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    // ignore
  }
  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}
