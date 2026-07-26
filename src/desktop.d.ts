import type { ReisDesktopBridge } from '../electron/contracts'

declare global {
  interface Window {
    reisDesktop?: ReisDesktopBridge
  }
}

export {}
