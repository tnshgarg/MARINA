import { app } from 'electron'
import { hostname } from 'os'

export const AGENT_VERSION: string = app.getVersion() || '0.1.0'
// Default server the pairing dialog pre-fills. Local-dev contributors can
// override with MARINA_SERVER_URL; everyone else gets the production app.
export const DEFAULT_SERVER_BASE_URL: string =
  process.env.MARINA_SERVER_URL?.replace(/\/+$/, '') || 'https://marina.team'
export const POLICY_VERSION = 'v1'
export const DEFAULT_DEVICE_LABEL = (() => {
  try {
    return hostname() || 'Mac'
  } catch {
    return 'Mac'
  }
})()

export const STORE_KEYS = {
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
} as const
