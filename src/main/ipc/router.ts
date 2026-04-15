import { EventEmitter } from 'events';

/**
 * Application-wide event bus.
 * Main-process modules emit events here; they are forwarded to the renderer
 * via webContents.send() in index.ts.
 */
export const appEvents = new EventEmitter();
appEvents.setMaxListeners(50);
