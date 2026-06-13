"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORE_KEYS = void 0;
exports.get = get;
exports.set = set;
exports.clearSensitive = clearSensitive;
exports.readToken = readToken;
exports.writeToken = writeToken;
const electron_1 = require("electron");
const electron_store_1 = __importDefault(require("electron-store"));
const config_1 = require("./config");
Object.defineProperty(exports, "STORE_KEYS", { enumerable: true, get: function () { return config_1.STORE_KEYS; } });
const store = new electron_store_1.default({
    name: 'marina-agent',
    watch: true,
});
function get(key) {
    return store.get(key);
}
function set(key, value) {
    if (value === undefined) {
        store.delete(key);
    }
    else {
        store.set(key, value);
    }
}
function clearSensitive() {
    store.delete(config_1.STORE_KEYS.encryptedToken);
    store.delete(config_1.STORE_KEYS.deviceId);
    store.delete(config_1.STORE_KEYS.userLogin);
    store.delete(config_1.STORE_KEYS.userName);
    store.delete(config_1.STORE_KEYS.pendingBatches);
}
/** Returns the decrypted bearer token, or null if not paired / decryption fails. */
function readToken() {
    const enc = get(config_1.STORE_KEYS.encryptedToken);
    if (!enc)
        return null;
    if (!electron_1.safeStorage.isEncryptionAvailable()) {
        console.error('safeStorage encryption not available — refusing to read token');
        return null;
    }
    try {
        return electron_1.safeStorage.decryptString(Buffer.from(enc, 'base64'));
    }
    catch (err) {
        console.error('failed to decrypt token', err);
        return null;
    }
}
/** Encrypts and persists the bearer token. */
function writeToken(plaintext) {
    if (!electron_1.safeStorage.isEncryptionAvailable()) {
        throw new Error('safeStorage encryption is not available on this system');
    }
    const enc = electron_1.safeStorage.encryptString(plaintext).toString('base64');
    set(config_1.STORE_KEYS.encryptedToken, enc);
}
//# sourceMappingURL=store.js.map