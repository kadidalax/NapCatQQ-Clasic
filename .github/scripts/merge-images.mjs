// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getProject, normalizeRepository, normalizeVersion } from '../../scripts/build-artifacts.mjs';

const project = getProject();
const version = normalizeVersion(process.env.NAPCAT_VERSION, { release: true });
const repository = normalizeRepository(process.env.NAPCAT_REPOSITORY, { required: true });
const image = `ghcr.io/${repository.split('/')[0].toLowerCase()}/${project.slug}`;
const references = {};
for (const architecture of ['amd64', 'arm64']) {
  const reference = JSON.parse(readFileSync(path.join('dist', 'image-digests', `${architecture}.json`), 'utf8'))[architecture];
  if (typeof reference !== 'string' || !reference.startsWith(image + '@sha256:') || !/sha256:[a-f0-9]{64}$/.test(reference)) throw new Error(`Invalid verified image digest for ${architecture}`);
  references[architecture] = reference;
}
execFileSync('docker', ['buildx', 'imagetools', 'create', '--tag', `${image}:${version}`, '--annotation', `index:org.opencontainers.image.source=https://github.com/${repository}`, '--annotation', `index:org.opencontainers.image.version=${version}`, '--annotation', 'index:org.opencontainers.image.licenses=LicenseRef-NapCat-Limited-Redistribution AND MIT AND Apache-2.0 AND LicenseRef-Tencent-QQ', ...Object.values(references)], { stdio: 'inherit' });
const inspection = execFileSync('docker', ['buildx', 'imagetools', 'inspect', `${image}:${version}`], { encoding: 'utf8' });
const digest = /^Digest:\s*(sha256:[a-f0-9]{64})\s*$/m.exec(inspection)?.[1];
if (!digest) throw new Error('Published multiarchitecture manifest has no verifiable digest');
writeFileSync(path.join('dist', 'image-digests.json'), JSON.stringify({ image: `${image}:${version}`, digest, architectures: references }, null, 2) + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `digest=${digest}\n`);
console.log(`Published verified multiarchitecture image: ${image}:${version}@${digest}`);
