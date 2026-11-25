// Leaving the app from Home or sign-in.
import * as settings from '../settings.js'
import { exitApp } from '../../utils/appLifecycle.js'
import { shellApp } from './shellState.js'
import { releaseVideos } from './lifecycle.js'

// Asks first unless Confirm Exit is off.
export const requestExit = () => {
  const app = shellApp()
  if (settings.get('exitConfirmation') === false || !app) {
    releaseVideos()
    exitApp()
  } else app.openExit()
}
