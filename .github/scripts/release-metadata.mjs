// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getProject, normalizeRepository, normalizeVersion } from '../../scripts/build-artifacts.mjs';

export function validateReleaseInput (input) {
  const raw = String(input ?? '');
  if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(raw)) throw new Error('Release input must be vX.Y.Z or X.Y.Z (no spaces or shell syntax)');
  const version = normalizeVersion(raw, { release: true });
  if (version.length > 100) throw new Error('Release version is too long for an image tag');
  return { version, tag: `v${version}` };
}

export function releaseMetadata (environment = process.env) {
  const project = getProject();
  const raw = environment.GITHUB_EVENT_NAME === 'workflow_dispatch' ? environment.RELEASE_INPUT : environment.GITHUB_REF_NAME;
  const { version, tag } = validateReleaseInput(raw);
  const repository = normalizeRepository(environment.NAPCAT_REPOSITORY || environment.GITHUB_REPOSITORY || project.repository, { required: true });
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  let sourceSha = git('rev-parse', 'HEAD');
  try {
    // An existing tag wins over a manually selected branch. A new manual tag
    // targets the selected workflow commit only after all gates have succeeded.
    sourceSha = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
  } catch (error) {
    if (environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') throw error;
  }
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Invalid release source commit');
  const image = `ghcr.io/${repository.split('/')[0].toLowerCase()}/${project.slug}`;
  const values = { version, tag, repository, image, source_sha: sourceSha };
  if (!environment.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is missing');
  appendFileSync(environment.GITHUB_OUTPUT, Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join(''));
  console.log(JSON.stringify(values, null, 2));
  return values;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { releaseMetadata(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
