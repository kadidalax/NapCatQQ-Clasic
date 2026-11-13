import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeConfiguredHttpUrl, parseConfiguredServiceUrls } from '../napcat-common/src/configured-urls';
import { NTQQFileApi } from '../napcat-core/apis/file';
import type { InstanceContext, NapCatCore } from '../napcat-core/index';
import { RequestUtil } from '../napcat-common/src/request';

const makeFileApi = (packetStatus: boolean = true) => {
  const fetchNativeRkey = vi.fn().mockResolvedValue([
    { rkey: '&rkey=private-native', time: Date.now() / 1000, type: 10, ttl: 3600n },
    { rkey: '&rkey=group-native', time: Date.now() / 1000, type: 20, ttl: 3600n },
  ]);
  const logger = { logWarn: vi.fn(), logError: vi.fn(), logDebug: vi.fn() };
  const context = { logger } as unknown as InstanceContext;
  const core = { apis: { PacketApi: { packetStatus, pkt: { operation: { FetchRkey: fetchNativeRkey } } } } } as unknown as NapCatCore;
  return { api: new NTQQFileApi(context, core), fetchNativeRkey, logger };
};
const getRkeyData = (api: NTQQFileApi) => (api as unknown as { getRkeyData(): Promise<{ group_rkey: string; private_rkey: string; online_rkey: boolean; }>; }).getRkeyData();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('explicit optional service configuration', () => {
  it('defaults to no external Rkey URLs and validates explicit JSON URL lists', () => {
    expect(parseConfiguredServiceUrls(undefined, 'NAPCAT_RKEY_FALLBACK_URLS')).toEqual([]);
    expect(parseConfiguredServiceUrls('[]', 'NAPCAT_RKEY_FALLBACK_URLS')).toEqual([]);
    expect(parseConfiguredServiceUrls('["https://rkey.example/service", "https://rkey.example/service"]', 'NAPCAT_RKEY_FALLBACK_URLS')).toEqual(['https://rkey.example/service']);
    expect(() => parseConfiguredServiceUrls('not-json', 'NAPCAT_RKEY_FALLBACK_URLS')).toThrow('JSON');
    expect(() => parseConfiguredServiceUrls('["file:///tmp/rkeys"]', 'NAPCAT_RKEY_FALLBACK_URLS')).toThrow('HTTP(S)');
    expect(() => normalizeConfiguredHttpUrl('https://user:secret@rkey.example/service')).toThrow('HTTP(S)');
  });

  it('keeps QQ native FetchRkey first and performs no default third-party request', async () => {
    vi.stubEnv('NAPCAT_RKEY_FALLBACK_URLS', '');
    const request = vi.spyOn(RequestUtil, 'HttpGetJson').mockImplementation(async () => { throw new Error('unexpected external request'); });
    const { api, fetchNativeRkey } = makeFileApi();
    expect(api.rkeyManager.serverUrl).toEqual([]);
    const result = await getRkeyData(api);
    expect(result).toEqual({ private_rkey: 'private-native', group_rkey: 'group-native', online_rkey: true });
    expect(fetchNativeRkey).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('also stays offline when packet support is absent', async () => {
    vi.stubEnv('NAPCAT_RKEY_FALLBACK_URLS', '[]');
    const request = vi.spyOn(RequestUtil, 'HttpGetJson').mockImplementation(async () => { throw new Error('unexpected external request'); });
    const { api, fetchNativeRkey } = makeFileApi(false);
    expect((await getRkeyData(api)).online_rkey).toBe(false);
    expect(fetchNativeRkey).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('uses only an explicit fallback URL after native lookup fails', async () => {
    vi.stubEnv('NAPCAT_RKEY_FALLBACK_URLS', '["https://rkey.example/service"]');
    const { api, fetchNativeRkey } = makeFileApi();
    fetchNativeRkey.mockRejectedValue(new Error('native fixture unavailable'));
    const request = vi.spyOn(RequestUtil, 'HttpGetJson').mockResolvedValue({ private_rkey: '&rkey=private-custom', group_rkey: '&rkey=group-custom', expired_time: Date.now() / 1000 + 3600 });
    expect((await getRkeyData(api)).online_rkey).toBe(true);
    expect(fetchNativeRkey).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('https://rkey.example/service', 'GET');
    expect(fetchNativeRkey.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]!);
  });

  it('an invalid external setting does not interrupt native QQ lookup', async () => {
    vi.stubEnv('NAPCAT_RKEY_FALLBACK_URLS', '["https://user:secret@rkey.example/service"]');
    const { api, logger } = makeFileApi();
    expect(api.rkeyManager.serverUrl).toEqual([]);
    expect(logger.logWarn).toHaveBeenCalledTimes(1);
    expect((await getRkeyData(api)).online_rkey).toBe(true);
  });
});
