/**
 * Where the E2E tests find the editor (#183). globalSetup starts a server of its own on a free port, every run, and
 * sets EDITOR_E2E_URL before the test workers start; this is the one place the tests read it. No test spells a port:
 * a developer's `npm run dev` on 5173 (or anything else on that port) is never what the tests drive.
 */
const url = process.env.EDITOR_E2E_URL;
if (!url) {
  throw new Error('EDITOR_E2E_URL is not set: it is set by tests/e2e/globalSetup.ts, so run the E2E tests with `npm run test:e2e`.');
}

/** The editor's address, with the trailing slash: `http://localhost:<port>/`. */
export const EDITOR_URL: string = new URL(url).href;

/** The editor's origin, without a trailing slash: `http://localhost:<port>`. */
export const EDITOR_ORIGIN: string = new URL(url).origin;
