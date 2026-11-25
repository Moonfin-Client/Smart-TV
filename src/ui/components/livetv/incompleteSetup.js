import { configureIncompleteRecordings } from '../../../services/incompleteRecordings.js'
import { seerrState } from '../../../state/seerr.js'
import * as settings from '../../../state/settings.js'

// Keeps the incomplete recordings service in step with the plugin's ping and the signed in user.
// App runs this at startup and on every user or settings change. The Live TV screens run it again
// as they open, which does nothing unless the plugin's answer came in since.
export const configureIncomplete = (user) => {
  const info = (seerrState() || {}).pluginInfo || null
  const key = JSON.stringify([!!settings.get('useMoonfinPlugin'), info && info.incompleteRecordingsSupported, info && info.extendedCompleteShowingsSupported, user && user.Id])
  if (key === configureIncomplete.last) return
  configureIncomplete.last = key
  configureIncompleteRecordings({
    supported: !!settings.get('useMoonfinPlugin') && !!info && info.incompleteRecordingsSupported === true,
    extended: !!info && info.extendedCompleteShowingsSupported === true,
    canManage: !!(user && user.Policy && user.Policy.EnableLiveTvManagement === true),
  })
}
