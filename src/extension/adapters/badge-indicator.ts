// SPDX-License-Identifier: MIT
import type { StatusIndicator } from '../ports'

const DEFAULT_TITLE = 'Pick an element (Alt+Shift+E)'
const FLASH_MS = 1500

/** Shows picker state on the toolbar icon: "ON" while armed, ✓ / ! flashes. */
export class BadgeIndicator implements StatusIndicator {
  // Why in memory: losing it on a worker restart only means a flash doesn't
  // fall back to "ON"; the next state change repaints the badge anyway.
  private readonly armedTabs = new Set<number>()
  private readonly flashTimers = new Map<number, ReturnType<typeof setTimeout>>()

  async armed(tabId: number): Promise<void> {
    this.armedTabs.add(tabId)
    this.clearFlash(tabId)
    await this.paint(tabId, 'ON', '#2563eb', 'Picking — click an element (Esc to stop)')
  }

  async idle(tabId: number): Promise<void> {
    this.armedTabs.delete(tabId)
    this.clearFlash(tabId)
    await this.paint(tabId, '', '#2563eb', DEFAULT_TITLE)
  }

  async delivered(tabId: number, detail: string): Promise<void> {
    await this.flash(tabId, '✓', '#16a34a', `Copied ${detail}`)
  }

  async error(tabId: number, message: string): Promise<void> {
    await this.flash(tabId, '!', '#dc2626', message)
  }

  private async flash(tabId: number, text: string, color: string, title: string): Promise<void> {
    this.clearFlash(tabId)
    await this.paint(tabId, text, color, title)
    this.flashTimers.set(
      tabId,
      setTimeout(() => {
        this.flashTimers.delete(tabId)
        const restore = this.armedTabs.has(tabId) ? this.armed(tabId) : this.idle(tabId)
        restore.catch(() => {})
      }, FLASH_MS)
    )
  }

  private clearFlash(tabId: number): void {
    const timer = this.flashTimers.get(tabId)
    if (timer) clearTimeout(timer)
    this.flashTimers.delete(tabId)
  }

  private async paint(tabId: number, text: string, color: string, title: string): Promise<void> {
    // The tab may have closed in the meantime; badge calls then just fail.
    await Promise.all([
      chrome.action.setBadgeText({ tabId, text }),
      chrome.action.setBadgeBackgroundColor({ tabId, color }),
      chrome.action.setTitle({ tabId, title })
    ]).catch(() => {})
  }
}
