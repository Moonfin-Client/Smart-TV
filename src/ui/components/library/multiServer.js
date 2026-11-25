import * as settings from '../../../state/settings.js'
import { getUniqueServers } from '../../../services/multiServerManager.js'

export const unifiedMode = async () => {
  if (!settings.get('unifiedLibraryMode')) return false
  const servers = await getUniqueServers().catch(() => [])
  return servers.filter((s) => s.userCount > 0).length > 1
}
