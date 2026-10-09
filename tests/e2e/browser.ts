/**
 * The browser every E2E test launches (#116). Each test file drives its own browser against the one dev server;
 * what it must not do is reach the real internet. Fixtures `owl:imports` real URLs (w3id.org, purl.org, …), and
 * the app reads imports in the background, so a test that left the network open depended on other people's
 * servers: slow or unreachable on a laptop, reachable on CI, and landing at an unpredictable moment either way.
 *
 * So every browser context created through launchBrowser() starts with all requests to anywhere but the dev
 * server aborted. A test that needs a URL to answer registers its own route (page.route / context.route): a
 * route registered later takes precedence over this one, so that is all it takes. The test still decides what
 * the world looks like; the default is just that there is no world.
 */
import { chromium, type Browser, type BrowserContext, type LaunchOptions } from 'playwright';

/** http(s) requests to anything but the dev server. (data:, blob: and the like never reach the network.) */
const isExternalRequest = (url: URL): boolean => (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== 'localhost';

/** Abort every request to anywhere but the dev server, in every page of `context`. Routes the test adds
 * afterwards take precedence. */
export async function isolateFromNetwork(context: BrowserContext): Promise<void> {
  await context.route(isExternalRequest, (route) => route.abort());
}

/** Launch headless Chromium whose contexts (and so pages) are isolated from the network by default. */
export async function launchBrowser(options: LaunchOptions = { headless: true }): Promise<Browser> {
  const browser = await chromium.launch(options);
  // browser.newPage() creates its context through browser.newContext(), so this covers both.
  const newContext = browser.newContext.bind(browser);
  (browser as { newContext: Browser['newContext'] }).newContext = async (contextOptions) => {
    const context = await newContext(contextOptions);
    await isolateFromNetwork(context);
    return context;
  };
  return browser;
}
