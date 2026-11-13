// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { appendFileSync } from 'node:fs';
import { getProject, normalizeVersion } from '../../scripts/build-artifacts.mjs';
const project = getProject();
const run = process.env.GITHUB_RUN_NUMBER;
const sha = process.env.GITHUB_SHA;
if (!/^[0-9]+$/.test(run ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '') || !process.env.GITHUB_OUTPUT) throw new Error('Missing or invalid GitHub build metadata');
// Preserve the final upstream version; trace CI builds by run/revision metadata.
const version = normalizeVersion(project.version);
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`NapCatQQ-clasic CI version: ${version}`);
