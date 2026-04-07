// Monkey-patch console.error BEFORE any other imports to prevent
// WatermelonDB sync diagnostic messages from triggering red box.
const _origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg.includes('[Sync]') ||
    msg.includes('Diagnostic error') ||
    msg.includes('already exists locally') ||
    msg.includes('does not exist locally')
  ) {
    console.warn('[WM Sync diagnostic]', ...args);
    return;
  }
  _origConsoleError(...args);
};

import { registerRootComponent } from 'expo';

import App from './src/App';

registerRootComponent(App);
