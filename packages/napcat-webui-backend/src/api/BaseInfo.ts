import type { RequestHandler } from 'express';
import { WebUiDataRuntime } from '@/napcat-webui-backend/src/helper/Data';
import { sendSuccess, sendError } from '@/napcat-webui-backend/src/utils/response';
import { WebUiConfig, webUiPathWrapper } from '@/napcat-webui-backend/index';
import { getMirrorConfig } from '@/napcat-common/src/mirror';
import { projectIdentity, PROJECT_FROZEN_MESSAGE } from '@/napcat-common/src/project';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const GetNapCatVersion: RequestHandler = (_, res) => {
  sendSuccess(res, { ...projectIdentity, version: WebUiDataRuntime.GetNapCatVersion(), updateStatus: 'frozen' });
};

export const GetProjectInfoHandler: RequestHandler = (_, res) => {
  sendSuccess(res, { ...projectIdentity, status: 'frozen', message: PROJECT_FROZEN_MESSAGE });
};

/** Legacy string response: the local version is always the latest in this frozen fork. */
export const getLatestTagHandler: RequestHandler = (_, res) => {
  sendSuccess(res, WebUiDataRuntime.GetNapCatVersion(), PROJECT_FROZEN_MESSAGE);
};

export interface VersionInfo {
  tag: string;
  type: 'release' | 'prerelease' | 'action';
  artifactId?: number;
  artifactName?: string;
  createdAt?: string;
  expiresAt?: string;
  size?: number;
  workflowRunId?: number;
  headSha?: string;
  workflowTitle?: string;
}

const positiveInteger = (value: unknown, fallback: number, maximum: number): number => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
};

/** Keep pagination compatibility without contacting a release or Actions endpoint. */
export const getAllReleasesHandler: RequestHandler = (req, res) => {
  sendSuccess(res, {
    versions: [] as VersionInfo[],
    pagination: {
      page: positiveInteger(req.query['page'], 1, Number.MAX_SAFE_INTEGER),
      pageSize: positiveInteger(req.query['pageSize'], 20, 100),
      total: 0,
      totalPages: 0,
    },
    mirror: '',
    status: 'frozen',
    frozen: true,
    updatesEnabled: false,
    currentVersion: WebUiDataRuntime.GetNapCatVersion(),
    message: PROJECT_FROZEN_MESSAGE,
  }, PROJECT_FROZEN_MESSAGE);
};

export const QQVersionHandler: RequestHandler = (_, res) => {
  const data = WebUiDataRuntime.getQQVersion();
  sendSuccess(res, data);
};

export const GetThemeConfigHandler: RequestHandler = async (_, res) => {
  const data = await WebUiConfig.GetTheme();
  sendSuccess(res, data);
};

export const SetThemeConfigHandler: RequestHandler = async (req, res) => {
  const { theme } = req.body;
  await WebUiConfig.UpdateTheme(theme);
  sendSuccess(res, { message: '更新成功' });
};

export const GetMirrorsHandler: RequestHandler = (_, res) => {
  const config = getMirrorConfig();
  sendSuccess(res, { mirrors: config.fileMirrors });
};

export const GetNapCatFileHashHandler: RequestHandler = (_, res) => {
  try {
    const filePath = path.join(webUiPathWrapper.binaryPath, 'napcat.mjs');
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha512').update(fileBuffer).digest('hex');
    sendSuccess(res, { hash, file: 'napcat.mjs', algorithm: 'sha512' });
  } catch (error) {
    sendError(res, `计算 napcat.mjs 的 hash 失败：${(error as Error).message}`);
  }
};
