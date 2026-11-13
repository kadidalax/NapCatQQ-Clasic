import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectFile = fileURLToPath(new URL('../../project.json', import.meta.url));

/** SemVer 2.0, with an optional release-tag v prefix. */
const SEMVER_REGEX = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function validateVersion (version) {
  const match = typeof version === 'string' && version.trim().match(SEMVER_REGEX);
  if (!match) {
    return { valid: false, normalized: '4.18.42', major: 4, minor: 18, patch: 42, prerelease: null, buildmetadata: null };
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prerelease = match[4] || null;
  const buildmetadata = match[5] || null;
  const normalized = `${major}.${minor}.${patch}${prerelease ? `-${prerelease}` : ''}${buildmetadata ? `+${buildmetadata}` : ''}`;
  return { valid: true, normalized, major, minor, patch, prerelease, buildmetadata };
}

/** Repository settings are explicit configuration; never infer an account from a display name. */
export function normalizeRepository (repository) {
  const value = typeof repository === 'string' ? repository.trim() : '';
  if (!value) return '';
  const url = new URL(/^[\w.-]+\/[\w.-]+$/.test(value) ? `https://github.com/${value}` : value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Project repository must be an HTTP(S) URL or owner/repository.');
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '').replace(/\.git$/, '');
}

/** Resolve the frozen project's identity locally. No network, tag cache or git command. */
export function resolveProjectIdentity (env = process.env, identityFile = projectFile) {
  let project;
  try {
    project = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    project = { name: 'NapCatQQ-clasic', slug: 'napcatqq-clasic', version: '4.18.42', maintainer: 'kadidalax', repository: 'https://github.com/kadidalax/NapCatQQ-Clasic', frozen: true };
    console.warn('[NapCatQQ-clasic] project.json missing; using the offline identity defaults.');
  }
  const version = validateVersion(env.NAPCAT_VERSION || project.version);
  if (!version.valid) throw new Error('NAPCAT_VERSION / project.json.version must be a valid SemVer version.');
  if (project.frozen !== true) throw new Error('NapCatQQ-clasic must remain frozen in project.json.');

  return {
    name: project.name || 'NapCatQQ-clasic',
    slug: project.slug || 'napcatqq-clasic',
    version: version.normalized,
    maintainer: project.maintainer || 'kadidalax',
    repository: normalizeRepository(env.NAPCAT_REPOSITORY || env.VITE_PROJECT_REPOSITORY || env.GITHUB_REPOSITORY || project.repository),
    frozen: true,
    updatesEnabled: false,
  };
}

/** Shared identity for Shell, Framework and WebUI builds, read from root project.json. */
export default function vitePluginNapcatVersion (options = {}) {
  let identity;
  return {
    name: 'vite-plugin-napcat-version',
    enforce: 'pre',
    config (userConfig) {
      identity = resolveProjectIdentity(options.env || process.env, options.projectFile || projectFile);
      console.log(`[${identity.name}] Building frozen v${identity.version}; repository: ${identity.repository || '未配置'}`);
      return {
        define: {
          ...(userConfig.define || {}),
          __NAPCAT_PROJECT__: JSON.stringify(identity),
          'import.meta.env.VITE_NAPCAT_VERSION': JSON.stringify(identity.version),
          'import.meta.env.VITE_PROJECT_NAME': JSON.stringify(identity.name),
          'import.meta.env.VITE_PROJECT_SLUG': JSON.stringify(identity.slug),
          'import.meta.env.VITE_PROJECT_MAINTAINER': JSON.stringify(identity.maintainer),
          'import.meta.env.VITE_PROJECT_REPOSITORY': JSON.stringify(identity.repository),
          'import.meta.env.VITE_PROJECT_FROZEN': 'true',
        },
      };
    },
    transformIndexHtml (html) {
      const name = identity?.name || 'NapCatQQ-clasic';
      // HTML attributes need escaping; JS constants are injected using JSON.stringify above.
      const escaped = name.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      return html.replaceAll('__NAPCAT_PROJECT_NAME__', escaped);
    },
    handleHotUpdate (ctx) {
      if (path.resolve(ctx.file) === path.resolve(options.projectFile || projectFile)) {
        // Defines are evaluated when Vite starts; restart rather than reusing stale identity.
        return ctx.server.restart();
      }
    },
  };
}
