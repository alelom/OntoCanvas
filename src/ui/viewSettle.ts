/**
 * Whether the graph view has settled after the latest render: each render ends by fitting the view, after a
 * short delay or once the force layout stabilises, so the view keeps moving for a moment after a load
 * "finishes". Anything that clicks or measures right after a render must wait for this. Each render takes
 * a token; only the latest render's token settles the view, so an earlier render's late fit can't report
 * "settled" while a newer one is still moving. Kept out of main.ts.
 */
let latest = 0;
let settledToken = 0;

/** A render is starting: the view is unsettled until `viewSettled(token)` with the returned token. */
export function beginViewSettle(): number {
  latest += 1;
  return latest;
}

/** The render that took `token` has finished moving the view. */
export function viewSettled(token: number): void {
  if (token === latest) settledToken = token;
}

export function isViewSettled(): boolean {
  return settledToken === latest;
}
