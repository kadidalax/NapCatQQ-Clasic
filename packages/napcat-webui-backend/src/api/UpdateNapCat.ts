import type { RequestHandler } from 'express';
import { sendResponse } from '@/napcat-webui-backend/src/utils/response';
import { ResponseCode } from '@/napcat-webui-backend/src/const/status';
import { projectIdentity, PROJECT_FROZEN_MESSAGE, PROJECT_NAME } from '@/napcat-common/src/project';
import type { NapCatPathWrapper } from '@/napcat-common/src/path';
import type { ILogWrapper } from '@/napcat-common/src/log-interface';

/** Keep the legacy endpoint but perform no download, extraction or file replacement. */
export const UpdateNapCatHandler: RequestHandler = (_req, res) => {
  sendResponse(res, {
    status: 'frozen',
    ...projectIdentity,
    currentVersion: projectIdentity.version,
  }, ResponseCode.Error, PROJECT_FROZEN_MESSAGE);
};

/**
 * Compatibility entry point for Shell and Framework startup.
 * Old napcat-update.json plans are ignored, including their source/target paths.
 * No plan is read, deleted, moved or applied, so the archived runtime stays unchanged.
 */
export async function applyPendingUpdates (_pathWrapper: NapCatPathWrapper, logger: ILogWrapper): Promise<void> {
  logger.log(`[${PROJECT_NAME}] ${PROJECT_FROZEN_MESSAGE} 历史更新计划已忽略。`);
}
