// The TV's model and firmware, from webOSSystem.deviceInfo and the TV system property service.
import LS2Request from './LS2Request.js'

const device = {}

const deviceinfo = (callback) => {
  if (Object.keys(device).length) {
    callback(device)
    return
  }
  try {
    const sys = window.webOSSystem || window.PalmSystem
    const info = JSON.parse(sys.deviceInfo)
    device.modelName = info.modelName
    device.modelNameAscii = info.modelNameAscii
    device.version = info.platformVersion
    device.sdkVersion = info.platformVersion
    device.screenWidth = info.screenWidth
    device.screenHeight = info.screenHeight
  } catch (e) {
    device.modelName = device.modelNameAscii = 'webOS Device'
  }
  device.screenHeight = device.screenHeight || window.screen.height
  device.screenWidth = device.screenWidth || window.screen.width
  if (typeof window.PalmServiceBridge === 'undefined') {
    callback(device)
    return
  }
  new LS2Request().send({
    service: 'luna://com.webos.service.tv.systemproperty',
    method: 'getSystemInfo',
    parameters: { keys: ['firmwareVersion', 'modelName', 'sdkVersion', 'UHD'] },
    onSuccess: (res) => {
      device.modelName = res.modelName || device.modelName
      device.modelNameAscii = res.modelName || device.modelNameAscii
      device.sdkVersion = res.sdkVersion || device.sdkVersion
      device.uhd = res.UHD === 'true'
      const fw = res.firmwareVersion && res.firmwareVersion !== '0.0.0' ? res.firmwareVersion : res.sdkVersion
      if (fw) device.version = fw
      callback(device)
    },
    onFailure: () => callback(device),
  })
}

export default deviceinfo
