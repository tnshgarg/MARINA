"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORE_KEYS = exports.DEFAULT_DEVICE_LABEL = exports.POLICY_VERSION = exports.DEFAULT_SERVER_BASE_URL = exports.AGENT_VERSION = void 0;
const electron_1 = require("electron");
const os_1 = require("os");
exports.AGENT_VERSION = electron_1.app.getVersion() || '0.1.0';
// Default server the pairing dialog pre-fills. Local-dev contributors can
// override with MARINA_SERVER_URL; everyone else gets the production app.
exports.DEFAULT_SERVER_BASE_URL = process.env.MARINA_SERVER_URL?.replace(/\/+$/, '') || 'https://marina.team';
exports.POLICY_VERSION = 'v1';
exports.DEFAULT_DEVICE_LABEL = (() => {
    try {
        return (0, os_1.hostname)() || 'Mac';
    }
    catch {
        return 'Mac';
    }
})();
exports.STORE_KEYS = {
    serverBaseUrl: 'serverBaseUrl',
    encryptedToken: 'encryptedToken',
    deviceId: 'deviceId',
    userLogin: 'userLogin',
    userName: 'userName',
    consentAt: 'consentAt',
    paused: 'paused',
    windowTitlesEnabled: 'windowTitlesEnabled',
    sampleIntervalSeconds: 'sampleIntervalSeconds',
    flushIntervalSeconds: 'flushIntervalSeconds',
    pendingBatches: 'pendingBatches',
    lastFlushAt: 'lastFlushAt',
    policyVersionAccepted: 'policyVersionAccepted',
};
//# sourceMappingURL=config.js.map