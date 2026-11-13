/** Public project identity. Internal napcat-* module and loader names remain compatible. */
export interface ProjectIdentity {
  readonly name: string;
  readonly slug: string;
  readonly version: string;
  readonly maintainer: string;
  readonly repository: string;
  readonly frozen: true;
  readonly updatesEnabled: false;
}

// Replaced by napcat-vite/vite-plugin-version.js in every application build.
declare const __NAPCAT_PROJECT__: ProjectIdentity;

const offlineIdentity: ProjectIdentity = {
  name: 'NapCatQQ-clasic',
  slug: 'napcatqq-clasic',
  version: '4.18.42',
  maintainer: 'kadidalax',
  repository: 'https://github.com/kadidalax/NapCatQQ-Clasic',
  frozen: true,
  updatesEnabled: false,
};

export const projectIdentity: ProjectIdentity = Object.freeze({
  ...(typeof __NAPCAT_PROJECT__ === 'undefined' ? offlineIdentity : __NAPCAT_PROJECT__),
  // This is a frozen fork, not a user-configurable update switch.
  frozen: true,
  updatesEnabled: false,
});

export const PROJECT_NAME = projectIdentity.name;
export const PROJECT_MAINTAINER = projectIdentity.maintainer;
export const PROJECT_REPOSITORY = projectIdentity.repository;
export const PROJECT_FROZEN_MESSAGE = `${PROJECT_NAME} 已停止维护，内置版本检查、更新下载和启动时覆盖更新均已关闭。`;
export const PROJECT_LICENSE_NOTICE = '本项目保留原项目 LICENSE；第三方代码与组件继续保留各自许可证和来源版权，详见发行包内许可文件。';

/** Use the injected repository, or the user's explicitly supplied offline repository fallback. */
export function getProjectRepositoryLink (relativePath: string = ''): string | undefined {
  if (!PROJECT_REPOSITORY) return undefined;
  return relativePath ? `${PROJECT_REPOSITORY}/${relativePath.replace(/^\//, '')}` : PROJECT_REPOSITORY;
}
