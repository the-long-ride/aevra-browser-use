/**
 * The only module that reaches into `vendor/aevra`. Every other file imports
 * aevra code from here, so a moved or renamed upstream file breaks one place.
 */
export { BrowserSessionRegistry } from '../vendor/aevra/packages/browser/src/registry.js';
export type { RegistryStatus } from '../vendor/aevra/packages/browser/src/registry.js';
export { ExtensionServer } from '../vendor/aevra/packages/browser/src/extension-server.js';
export { ExtensionDriver } from '../vendor/aevra/packages/browser/src/extension-driver.js';
export { CdpDriver } from '../vendor/aevra/packages/browser/src/cdp-driver.js';
export {
  BrowserDriverError,
  MAX_WAIT_FOR_MS,
} from '../vendor/aevra/packages/browser/src/driver.js';
export type { BrowserDriver, ConnectOptions } from '../vendor/aevra/packages/browser/src/driver.js';
export {
  classifyOrigin,
  DEFAULT_ORIGIN_POLICY,
} from '../vendor/aevra/packages/browser/src/origin-policy.js';
export type { OriginPolicyConfig } from '../vendor/aevra/packages/browser/src/origin-policy.js';
export type {
  BrowserActionInput,
  BrowserActionResult,
  BrowserExtensionPairing,
  BrowserListenerHealth,
  BrowserOriginClass,
  BrowserTabInfo,
} from '../vendor/aevra/packages/protocol/src/browser.js';
export {
  mintExtensionToken,
  verifyExtensionToken,
} from '../vendor/aevra/packages/security/src/extension-token.js';
export { scanNavigateUrl } from '../vendor/aevra/packages/security/src/browser-url-policy.js';
export { redactText } from '../vendor/aevra/packages/security/src/dlp.js';
export { markUntrusted } from '../vendor/aevra/packages/security/src/untrusted.js';
export { AevraToolError } from '../vendor/aevra/packages/mcp-tools/src/errors.js';
export { normalizeBrowserActions } from '../vendor/aevra/packages/mcp-tools/src/browser-action-input.js';
export { parseBrowserScript } from '../vendor/aevra/packages/mcp-tools/src/browser-script.js';
export {
  redactBrowserResult,
  reclassifyOrigins,
  UNTRUSTED_RESULTS,
} from '../vendor/aevra/packages/mcp-tools/src/browser-results.js';
export {
  refuseBlockedOrigin,
  refuseSensitiveScreenshot,
} from '../vendor/aevra/packages/mcp-tools/src/browser-risk.js';
