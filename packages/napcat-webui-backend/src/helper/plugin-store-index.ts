import type { PluginStoreItem, PluginStoreList } from '../types/PluginStore';
import { PROJECT_NAME } from '@/napcat-common/src/project';

export const PLUGIN_STORE_OFFLINE_MESSAGE = `${PROJECT_NAME} 默认插件商店已关闭。仅在用户显式配置自定义索引 URL 后联网；也可在插件管理页导入本地插件。`;

/** No built-in source, mirror or upstream URL is added to this list. */
export function normalizePluginStoreSources (sources: unknown): string[] {
  if (!Array.isArray(sources) || sources.length > 10) {
    throw new Error('pluginStoreSources 应为最多 10 个 HTTP(S) 索引 URL 的数组。');
  }
  return [...new Set(sources.map(source => {
    if (typeof source !== 'string' || source.length > 2048) throw new Error('插件源必须是 HTTP(S) URL。');
    const url = new URL(source.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('插件源必须是无账号密码的 HTTP(S) URL。');
    }
    url.hash = '';
    return url.toString();
  }))];
}

function validateIndex (data: unknown): PluginStoreList {
  if (!data || typeof data !== 'object' || !Array.isArray((data as PluginStoreList).plugins)) {
    throw new Error('插件索引缺少 plugins 数组。');
  }
  const index = data as PluginStoreList;
  const plugins = index.plugins.map((plugin: PluginStoreItem) => {
    if (!plugin || typeof plugin.id !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(plugin.id) || ['.', '..'].includes(plugin.id)) {
      throw new Error('插件索引包含无效 ID。');
    }
    for (const field of ['name', 'version', 'description', 'author', 'downloadUrl'] as const) {
      if (typeof plugin[field] !== 'string') throw new Error(`插件 ${plugin.id} 缺少 ${field}。`);
    }
    const url = new URL(plugin.downloadUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`插件 ${plugin.id} 下载地址应为 HTTP(S) URL。`);
    return plugin;
  });
  return { version: typeof index.version === 'string' ? index.version : '1', updateTime: typeof index.updateTime === 'string' ? index.updateTime : '', plugins };
}

/** Cache is scoped to explicit source configuration, never to the previous upstream index. */
export class PluginStoreIndex {
  private cache: { sources: string; timestamp: number; data: PluginStoreList; } | undefined;
  private readonly cacheTtl = 10 * 60 * 1000;

  async get (sources: string[], forceRefresh: boolean = false, fetchIndex: typeof fetch = fetch): Promise<PluginStoreList> {
    const configuredSources = normalizePluginStoreSources(sources);
    if (!configuredSources.length) {
      this.cache = undefined;
      return { version: '1', updateTime: '', plugins: [], sources: [], networkEnabled: false, message: PLUGIN_STORE_OFFLINE_MESSAGE };
    }

    const sourceKey = JSON.stringify(configuredSources);
    if (!forceRefresh && this.cache?.sources === sourceKey && Date.now() - this.cache.timestamp < this.cacheTtl) {
      return this.cache.data;
    }

    const errors: string[] = [];
    for (const source of configuredSources) {
      try {
        const response = await fetchIndex(source, {
          headers: { 'User-Agent': `${PROJECT_NAME}-WebUI` },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        const index = validateIndex(await response.json());
        const data = { ...index, sources: configuredSources, networkEnabled: true, message: '使用用户显式配置的插件源。' };
        this.cache = { sources: sourceKey, timestamp: Date.now(), data };
        return data;
      } catch (error) {
        errors.push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`自定义插件源获取失败：\n${errors.join('\n')}`);
  }
}
