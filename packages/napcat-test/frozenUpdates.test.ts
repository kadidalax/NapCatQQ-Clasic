import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import https from 'node:https';
import type { NapCatPathWrapper } from '../napcat-common/src/path';
import type { ILogWrapper } from '../napcat-common/src/log-interface';

vi.mock('@/napcat-webui-backend/index', () => ({ WebUiConfig: {}, webUiPathWrapper: {} }));
vi.mock('@/napcat-common/src/mirror', () => ({ getMirrorConfig: () => ({ fileMirrors: [] }) }));

import { UpdateNapCatHandler, applyPendingUpdates } from '../napcat-webui-backend/src/api/UpdateNapCat';
import { GetNapCatVersion, GetProjectInfoHandler, getLatestTagHandler, getAllReleasesHandler } from '../napcat-webui-backend/src/api/BaseInfo';
import { getLatestTag, getAllTags } from '../napcat-common/src/helper';
import { projectIdentity, PROJECT_FROZEN_MESSAGE } from '../napcat-common/src/project';

const createResponse = () => {
  const response = { status: vi.fn(), json: vi.fn(), send: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
};
const next = vi.fn() as NextFunction;

afterEach(() => vi.restoreAllMocks());

describe('frozen version and update compatibility API', () => {
  it('returns local identity and local latest version without network', async () => {
    const network = vi.spyOn(https, 'get').mockImplementation(() => { throw new Error('unexpected network'); });
    const response = createResponse();
    await GetNapCatVersion({} as Request, response as unknown as Response, next);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: 0, data: expect.objectContaining({ name: 'NapCatQQ-clasic', version: projectIdentity.version, frozen: true, updatesEnabled: false }) }));
    await GetProjectInfoHandler({} as Request, response as unknown as Response, next);
    expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'frozen', message: PROJECT_FROZEN_MESSAGE }) }));
    await getLatestTagHandler({} as Request, response as unknown as Response, next);
    expect(response.json).toHaveBeenLastCalledWith({ code: 0, data: projectIdentity.version, message: PROJECT_FROZEN_MESSAGE });
    expect(await getLatestTag('https://ignored.example')).toBe(projectIdentity.version);
    expect(await getAllTags('https://ignored.example')).toEqual({ tags: [`v${projectIdentity.version}`], mirror: '' });
    expect(network).not.toHaveBeenCalled();
  });

  it('returns an empty release list for every type/mirror and clamps pagination', async () => {
    const network = vi.spyOn(https, 'request').mockImplementation(() => { throw new Error('unexpected network'); });
    const response = createResponse();
    for (const type of ['all', 'action', 'release']) {
      await getAllReleasesHandler({ query: { type, page: '-1', pageSize: '10000', mirror: 'https://ignored.example' } } as unknown as Request, response as unknown as Response, next);
      expect(response.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: 0, data: expect.objectContaining({ versions: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 }, status: 'frozen', updatesEnabled: false }) }));
    }
    expect(network).not.toHaveBeenCalled();
  });

  it('never examines an update payload and reports a frozen error, even when forced', async () => {
    const readBody = vi.fn(() => { throw new Error('body should remain unused'); });
    const request = {};
    Object.defineProperty(request, 'body', { get: readBody });
    const response = createResponse();
    const network = vi.spyOn(https, 'get').mockImplementation(() => { throw new Error('unexpected network'); });
    await UpdateNapCatHandler(request as Request, response as unknown as Response, next);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: -1, message: PROJECT_FROZEN_MESSAGE, data: expect.objectContaining({ status: 'frozen', frozen: true, updatesEnabled: false }) }));
    expect(readBody).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it('leaves an old pending update plan and its target file byte-for-byte unchanged', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'napcatqq-clasic-pending-'));
    try {
      const configPath = join(directory, 'config');
      mkdirSync(configPath);
      const sourcePath = join(directory, 'replacement.mjs');
      const targetPath = join(directory, 'runtime.mjs');
      const planPath = join(configPath, 'napcat-update.json');
      const plan = JSON.stringify({ version: '99.0.0', files: [{ sourcePath, targetPath }] });
      writeFileSync(sourcePath, 'replacement');
      writeFileSync(targetPath, 'original frozen runtime');
      writeFileSync(planPath, plan);
      const logger = { log: vi.fn(), logWarn: vi.fn(), logError: vi.fn() };
      await applyPendingUpdates({ configPath } as NapCatPathWrapper, logger as unknown as ILogWrapper);
      expect(readFileSync(targetPath, 'utf8')).toBe('original frozen runtime');
      expect(readFileSync(planPath, 'utf8')).toBe(plan);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('历史更新计划已忽略'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
