/**
 * The repository the version link points to (#172, first step of #144): taken from the build, with the upstream
 * repository as the fallback, and never anything that is not an http(s) address (it ends up in an href).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveRepoUrl, UPSTREAM_REPO_URL } from '../../src/utils/siteInfo';

describe('resolveRepoUrl', () => {
  it('falls back to the upstream repository when nothing is configured', () => {
    expect(resolveRepoUrl(undefined)).toBe(UPSTREAM_REPO_URL);
    expect(resolveRepoUrl('')).toBe(UPSTREAM_REPO_URL);
    expect(resolveRepoUrl('   ')).toBe(UPSTREAM_REPO_URL);
  });

  it('uses the configured repository, without a trailing slash or surrounding spaces', () => {
    expect(resolveRepoUrl('https://github.com/SomeOrg/OntoCanvas')).toBe('https://github.com/SomeOrg/OntoCanvas');
    expect(resolveRepoUrl(' https://github.com/SomeOrg/OntoCanvas/ ')).toBe('https://github.com/SomeOrg/OntoCanvas');
  });

  it('accepts http as well as https', () => {
    expect(resolveRepoUrl('http://git.example.org/team/OntoCanvas')).toBe('http://git.example.org/team/OntoCanvas');
  });

  it('refuses anything that is not an http(s) address, and falls back', () => {
    expect(resolveRepoUrl('javascript:alert(1)')).toBe(UPSTREAM_REPO_URL);
    expect(resolveRepoUrl('data:text/html,<script>alert(1)</script>')).toBe(UPSTREAM_REPO_URL);
    expect(resolveRepoUrl('not a url')).toBe(UPSTREAM_REPO_URL);
    expect(resolveRepoUrl('//github.com/SomeOrg/OntoCanvas')).toBe(UPSTREAM_REPO_URL);
  });

  it('the upstream fallback is the alelom repository', () => {
    expect(UPSTREAM_REPO_URL).toBe('https://github.com/alelom/OntoCanvas');
  });
});

describe('REPO_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is the upstream repository in a build that configures nothing', async () => {
    vi.stubEnv('VITE_REPO_URL', '');
    vi.resetModules();
    expect((await import('../../src/utils/siteInfo')).REPO_URL).toBe('https://github.com/alelom/OntoCanvas');
  });

  it('is the repository the build was given', async () => {
    vi.stubEnv('VITE_REPO_URL', 'https://github.com/SomeOrg/OntoCanvas');
    vi.resetModules();
    expect((await import('../../src/utils/siteInfo')).REPO_URL).toBe('https://github.com/SomeOrg/OntoCanvas');
  });
});
