// SPDX-License-Identifier: MIT
import { dataUrlToBlob } from '../../core'
import type { ScreenCapturer, TabRef } from '../ports'

/** captureVisibleTab is allowed by activeTab; Chrome rate-limits it to ~2 calls/s. */
export class ChromeCapturer implements ScreenCapturer {
  async captureVisible(tab: TabRef): Promise<Blob> {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    return dataUrlToBlob(dataUrl)
  }
}
