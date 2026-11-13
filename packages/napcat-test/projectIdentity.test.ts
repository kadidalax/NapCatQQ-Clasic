import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import vitePluginNapcatVersion, { normalizeRepository, resolveProjectIdentity, validateVersion } from '../napcat-vite/vite-plugin-version.js';
import { projectIdentity, getProjectRepositoryLink } from '../napcat-common/src/project';

const fixture = { name: 'NapCatQQ-clasic', slug: 'napcatqq-clasic', version: '1.0.0', maintainer: 'YG', repository: '', frozen: true };
let temporaryDirectory: string;
let identityFile: string;

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'napcatqq-clasic-identity-'));
  identityFile = join(temporaryDirectory, 'project.json');
  writeFileSync(identityFile, JSON.stringify(fixture));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('offline project build identity', () => {
  it('uses the local identity and never guesses a GitHub account from YG', () => {
    expect(resolveProjectIdentity({}, identityFile)).toEqual({ ...fixture, updatesEnabled: false });
    expect(projectIdentity.name).toBe('NapCatQQ-clasic');
    expect(projectIdentity.frozen).toBe(true);
    expect(projectIdentity.updatesEnabled).toBe(false);
    // Test link construction without coupling this fixture to the actual repository owner.
    expect(getProjectRepositoryLink()).toBe(projectIdentity.repository || undefined);
    expect(getProjectRepositoryLink('releases')).toBe(projectIdentity.repository ? `${projectIdentity.repository}/releases` : undefined);
  });

  it('prioritizes and normalizes NAPCAT_VERSION over the local version', () => {
    expect(resolveProjectIdentity({ NAPCAT_VERSION: ' v1.2.3-rc.1+build.42 ' }, identityFile).version).toBe('1.2.3-rc.1+build.42');
    expect(() => resolveProjectIdentity({ NAPCAT_VERSION: 'not-a-version' }, identityFile)).toThrow('valid SemVer');
    expect(validateVersion('01.0.0').valid).toBe(false);
  });

  it('uses an explicit repository or CI repository with deterministic precedence', () => {
    expect(resolveProjectIdentity({ GITHUB_REPOSITORY: 'example-owner/napcatqq-clasic' }, identityFile).repository).toBe('https://github.com/example-owner/napcatqq-clasic');
    expect(resolveProjectIdentity({ NAPCAT_REPOSITORY: 'https://git.example/fork/napcatqq-clasic.git', VITE_PROJECT_REPOSITORY: 'ignored/repo', GITHUB_REPOSITORY: 'also-ignored/repo' }, identityFile).repository).toBe('https://git.example/fork/napcatqq-clasic');
    expect(normalizeRepository('')).toBe('');
    expect(() => normalizeRepository('javascript:alert(1)')).toThrow('HTTP(S)');
    expect(() => normalizeRepository('https://user:password@git.example/fork/repo')).toThrow('HTTP(S)');
  });

  it('ignores old online version caches and injects the same frozen identity for every build', () => {
    mkdirSync(join(temporaryDirectory, 'dist'));
    writeFileSync(join(temporaryDirectory, 'dist', '.napcat-version.json'), JSON.stringify({ tag: '99.0.0' }));
    const network = vi.spyOn(https, 'get').mockImplementation(() => { throw new Error('network should remain unused'); });
    const plugin = vitePluginNapcatVersion({ env: {}, projectFile: identityFile });
    const configHook = plugin.config as (config: { define?: Record<string, string>; }) => { define: Record<string, string>; };
    const config = configHook({ define: { existing: 'true' } });
    expect(JSON.parse(config.define['__NAPCAT_PROJECT__']!)).toEqual({ ...fixture, updatesEnabled: false });
    expect(config.define['import.meta.env.VITE_NAPCAT_VERSION']).toBe('"1.0.0"');
    expect(config.define['import.meta.env.VITE_PROJECT_REPOSITORY']).toBe('""');
    expect(config.define['existing']).toBe('true');
    expect(network).not.toHaveBeenCalled();
  });

  it('keeps source builds offline when project.json is absent and disallows unfreezing', () => {
    expect(resolveProjectIdentity({}, join(temporaryDirectory, 'missing.json')).version).toBe('4.18.42');
    writeFileSync(identityFile, JSON.stringify({ ...fixture, frozen: false }));
    expect(() => resolveProjectIdentity({}, identityFile)).toThrow('must remain frozen');
  });
});
