import { rokuCaps } from './caps.js'

let cached = null

export const getDeviceInfo = async () => {
  if (cached) return cached
  const c = await rokuCaps()
  const os = c.osVersion || {}
  cached = {
    platform: 'Roku',
    appVersion: process.env.REACT_APP_VERSION || '0.0.0',
    userAgent: navigator.userAgent,
    screenSize: '1920x1080',
    tvVersion: [os.major, os.minor, os.revision].filter((v) => v != null).join('.') || 'Unknown',
    modelName: c.modelName || c.model || 'Roku',
    ipAddress: c.ip || '',
  }
  return cached
}
