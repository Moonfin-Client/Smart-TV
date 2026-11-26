import { rokuCaps } from './caps.js'

export const getCountryCode = async () => (await rokuCaps()).country || null
