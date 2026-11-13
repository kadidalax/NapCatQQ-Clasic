import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const readPackageSource = (relativePath: string): string => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('no implicit cosmetic or promotional network requests', () => {
  it('keeps the dashboard widget local and displays the frozen project state', () => {
    const source = readPackageSource('napcat-webui-frontend/src/components/hitokoto.tsx');
    const dashboard = readPackageSource('napcat-webui-frontend/src/pages/dashboard/index.tsx');
    expect(dashboard).toContain('<Hitokoto />');
    expect(source).toContain('PROJECT_FROZEN_MESSAGE');
    expect(source).toContain('projectIdentity.version');
    expect(source).not.toMatch(/useRequest|request\.get|\bfetch\s*\(|hi\.logacg\.com/);
  });

  it('uses local initials instead of inferred third-party plugin avatars', () => {
    for (const relativePath of [
      'napcat-webui-frontend/src/components/display_card/plugin_card.tsx',
      'napcat-webui-frontend/src/components/display_card/plugin_store_card.tsx',
      'napcat-webui-frontend/src/pages/dashboard/plugin_detail_modal.tsx',
    ]) {
      const source = readPackageSource(relativePath);
      expect(source).not.toMatch(/avatar\.vercel\.sh|api\.iowen\.cn|getAuthorAvatar/);
      expect(source).toContain("name={author || '?'}");
    }
  });

  it('only loads a plugin README after the explicit network button is pressed', () => {
    const source = readPackageSource('napcat-webui-frontend/src/pages/dashboard/plugin_detail_modal.tsx');
    expect(source).toContain('onPress={loadReadme}');
    expect(source).toContain('联网加载 README');
    expect(source).not.toMatch(/\bloadReadme\(\);/);
  });

  it('does not infer and download author avatars after plugin installation', () => {
    const source = readPackageSource('napcat-webui-backend/src/api/PluginStore.ts');
    expect(source).not.toMatch(/cachePluginIcon|fetch\(avatarUrl/);
    // Explicit custom-source plugin downloads are still supported.
    expect(source).toContain('await downloadFile(plugin.downloadUrl');
  });
});
