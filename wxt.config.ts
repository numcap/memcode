import { defineConfig } from 'wxt';
import { SITE_MATCHES } from './lib/sites';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // MV3 for every browser: the page hook needs `world: "MAIN"` content scripts,
  // which Firefox only supports in MV3 (128+).
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'MemCode',
    description: 'Spaced repetition for the LeetCode and NeetCode problems you solve.',
    permissions: ['storage', 'unlimitedStorage', 'alarms'],
    // Declared explicitly so Firefox users can re-grant site access if they revoke it.
    host_permissions: SITE_MATCHES,
    action: { default_title: 'MemCode' },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'memcode@memcode',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        // Android only gained data_collection_permissions in 142.
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
