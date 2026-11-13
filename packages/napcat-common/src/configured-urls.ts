/** Normalize a user-supplied service URL without introducing any default endpoint. */
export function normalizeConfiguredHttpUrl (value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new Error('服务地址应为 HTTP(S) URL。');
  }
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('服务地址应为无账号密码的 HTTP(S) URL。');
  }
  url.hash = '';
  return url.toString();
}

/** Environment setting for explicitly selected fallback services; empty means offline. */
export function parseConfiguredServiceUrls (value: string | undefined, settingName: string): string[] {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${settingName} 应为 JSON URL 数组。`);
  }
  if (!Array.isArray(parsed) || parsed.length > 10) {
    throw new Error(`${settingName} 应为最多 10 项的 JSON URL 数组。`);
  }
  return [...new Set(parsed.map(normalizeConfiguredHttpUrl))];
}
