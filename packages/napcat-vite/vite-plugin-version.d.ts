// Structural hook types keep the shared plugin compatible with both Vite 6 and Vite 7.
export interface ProjectVersionPlugin {
  name: string;
  enforce: 'pre';
  config(config: { define?: Record<string, unknown>; }): { define: Record<string, string>; };
  transformIndexHtml(html: string): string;
  handleHotUpdate(context: { file: string; server: { restart(): Promise<void>; }; }): void | Promise<void>;
}

export interface ProjectBuildIdentity {
  name: string;
  slug: string;
  version: string;
  maintainer: string;
  repository: string;
  frozen: true;
  updatesEnabled: false;
}

export interface VersionValidation {
  valid: boolean;
  normalized: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  buildmetadata: string | null;
}

export function validateVersion(version: unknown): VersionValidation;
export function normalizeRepository(repository: unknown): string;
export function resolveProjectIdentity(env?: Record<string, string | undefined>, identityFile?: string): ProjectBuildIdentity;
export default function vitePluginNapcatVersion(options?: { env?: Record<string, string | undefined>; projectFile?: string; }): ProjectVersionPlugin;
