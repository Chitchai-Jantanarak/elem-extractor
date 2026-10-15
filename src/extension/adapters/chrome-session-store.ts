// SPDX-License-Identifier: MIT
import type { PickerSession, SessionStore } from '../ports'

/**
 * chrome.storage.session survives service-worker restarts but not a browser
 * restart, which is exactly the lifetime of an on-page picker.
 */
export class ChromeSessionStore implements SessionStore {
  constructor(private readonly prefix = 'picker:') {}

  private key(tabId: number): string {
    return `${this.prefix}${tabId}`
  }

  async get(tabId: number): Promise<PickerSession | undefined> {
    const key = this.key(tabId)
    const items = await chrome.storage.session.get(key)
    return items[key] as PickerSession | undefined
  }

  async set(tabId: number, session: PickerSession): Promise<void> {
    await chrome.storage.session.set({ [this.key(tabId)]: session })
  }

  async delete(tabId: number): Promise<void> {
    await chrome.storage.session.remove(this.key(tabId))
  }
}

/** In-memory SessionStore for tests and non-extension hosts. */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<number, PickerSession>()

  async get(tabId: number): Promise<PickerSession | undefined> {
    return this.sessions.get(tabId)
  }

  async set(tabId: number, session: PickerSession): Promise<void> {
    this.sessions.set(tabId, session)
  }

  async delete(tabId: number): Promise<void> {
    this.sessions.delete(tabId)
  }
}
