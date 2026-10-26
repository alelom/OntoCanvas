/**
 * OntoCanvas's own addresses, taken from the build (first step of #144, for the repository only).
 *
 * `VITE_REPO_URL` names the repository the site was built for; a local or dev build, which sets nothing, names
 * the upstream repository. It is not read from `window.location`: that would name whatever page the app is
 * embedded in.
 */

export const UPSTREAM_REPO_URL = 'https://github.com/alelom/OntoCanvas';

/** The configured repository, or the upstream one when it is missing or not an http(s) address (it is used as an href). */
export function resolveRepoUrl(configured: string | undefined): string {
  const url = configured?.trim().replace(/\/+$/, '');
  return url && /^https?:\/\/\S+$/i.test(url) ? url : UPSTREAM_REPO_URL;
}

export const REPO_URL = resolveRepoUrl(import.meta.env.VITE_REPO_URL);
