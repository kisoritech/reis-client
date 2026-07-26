import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'REIS',
    executableName: 'REIS',
    appBundleId: 'com.reis.desktop',
    appCategoryType: 'public.app-category.business',
    asar: true,
    protocols: [{ name: 'REIS', schemes: ['reis'] }],
    osxSign: process.env.APPLE_SIGN_IDENTITY
        ? {
            identity: process.env.APPLE_SIGN_IDENTITY,
            optionsForFile: () => ({
              hardenedRuntime: true,
              entitlements: 'entitlements.mac.plist',
            }),
          }
      : undefined,
    osxNotarize:
      process.env.APPLE_API_KEY_PATH &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER
        ? {
            appleApiKey: process.env.APPLE_API_KEY_PATH,
            appleApiKeyId: process.env.APPLE_API_KEY_ID,
            appleApiIssuer: process.env.APPLE_API_ISSUER,
          }
        : undefined,
  },
  makers: [new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'electron/main.ts', config: 'vite.main.config.ts' },
        { entry: 'electron/preload.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
}

export default config
