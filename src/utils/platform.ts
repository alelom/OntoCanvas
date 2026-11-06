/** Whether the page runs on Windows, where a browser cannot read a file whose full path is longer than 260 characters. */
export const runsOnWindows = (): boolean =>
  typeof navigator !== 'undefined' && /Win/i.test((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '');
