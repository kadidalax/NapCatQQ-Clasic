import { describe, expect, it, vi } from 'vitest';
import { PluginStoreIndex, normalizePluginStoreSources, PLUGIN_STORE_OFFLINE_MESSAGE } from '../napcat-webui-backend/src/helper/plugin-store-index';

const fixture = {
  version: '1', updateTime: '2026-01-01',
  plugins: [{ id: 'local-example', name: 'Example', version: '1.0.0', description: 'Custom source fixture', author: 'Example', downloadUrl: 'https://plugins.example/example.zip' }],
};
const makeFetcher = () => vi.fn().mockResolvedValue({ ok: true, json: async () => fixture });

describe('explicit plugin store sources', () => {
  it('stays offline by default, including forced refresh', async () => {
    const store = new PluginStoreIndex();
    const fetcher = makeFetcher();
    for (const forceRefresh of [false, true]) {
      expect(await store.get([], forceRefresh, fetcher as typeof fetch)).toEqual({ version: '1', updateTime: '', plugins: [], sources: [], networkEnabled: false, message: PLUGIN_STORE_OFFLINE_MESSAGE });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('contacts only the explicitly configured URL and caches by source', async () => {
    const store = new PluginStoreIndex();
    const fetcher = makeFetcher();
    const source = 'https://plugins.example/index.json';
    const result = await store.get([source], false, fetcher as typeof fetch);
    expect(result.plugins).toEqual(fixture.plugins);
    expect(result.networkEnabled).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(source);
    await store.get([source], false, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await store.get(['https://another.example/index.json'], false, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![0]).toBe('https://another.example/index.json');
  });

  it('drops cached external entries immediately when all sources are cleared', async () => {
    const store = new PluginStoreIndex();
    const fetcher = makeFetcher();
    await store.get(['https://plugins.example/index.json'], false, fetcher as typeof fetch);
    const offline = await store.get([], true, fetcher as typeof fetch);
    expect(offline.plugins).toEqual([]);
    expect(offline.networkEnabled).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('validates source URLs without falling back to a built-in upstream', async () => {
    expect(normalizePluginStoreSources(['https://plugins.example/index.json', 'https://plugins.example/index.json'])).toEqual(['https://plugins.example/index.json']);
    expect(() => normalizePluginStoreSources(['file:///tmp/index.json'])).toThrow('HTTP(S)');
    expect(() => normalizePluginStoreSources(['https://user:secret@plugins.example/index.json'])).toThrow('HTTP(S)');
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    await expect(new PluginStoreIndex().get(['https://plugins.example/missing.json'], false, fetcher as typeof fetch)).rejects.toThrow('自定义插件源获取失败');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed custom indexes before exposing them to installers', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...fixture, plugins: [{ ...fixture.plugins[0], id: '..' }] }) });
    await expect(new PluginStoreIndex().get(['https://plugins.example/index.json'], false, fetcher as typeof fetch)).rejects.toThrow('无效 ID');
  });
});
