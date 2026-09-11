import { getStorage } from './storage.mjs';

// Resolved only in the Render server build, never in the Sites Worker build.
export const env = new Proxy({}, {
  get(_target, name) {
    if (name === 'DB' || name === 'BUCKET') return getStorage()[name];
    return process.env[name];
  },
});
