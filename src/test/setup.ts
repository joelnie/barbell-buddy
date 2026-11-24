import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Deterministic in-memory BroadcastChannel hub for jsdom multi-tab realtime tests
type ChannelListener = (ev: MessageEvent) => void;
const channelRegistry = new Map<string, Set<MockBroadcastChannel>>();

class MockBroadcastChannel {
  readonly name: string;
  onmessage: ChannelListener | null = null;
  private listeners = new Set<ChannelListener>();
  private closed = false;

  constructor(name: string) {
    this.name = name;
    let peers = channelRegistry.get(name);
    if (!peers) {
      peers = new Set();
      channelRegistry.set(name, peers);
    }
    peers.add(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) return;
    const peers = channelRegistry.get(this.name);
    if (!peers) return;
    for (const peer of peers) {
      if (peer === this || peer.closed) continue;
      const event = new MessageEvent('message', { data });
      peer.onmessage?.(event);
      for (const fn of peer.listeners) {
        fn(event);
      }
    }
  }

  addEventListener(type: string, listener: ChannelListener): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: ChannelListener): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  close(): void {
    this.closed = true;
    channelRegistry.get(this.name)?.delete(this);
    this.listeners.clear();
  }
}

Object.defineProperty(globalThis, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
  configurable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  channelRegistry.clear();
});
