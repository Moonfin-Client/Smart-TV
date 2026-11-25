// A Luna service call through the webOS service bridge.

// A bridge nothing refers to can be collected before its answer arrives, which then never comes.
// Each request is held here until it has its answer, or for a subscription until it's canceled.
const live = new Set()

export default class LS2Request {
  send({ service, method, parameters = {}, onSuccess, onFailure, onComplete, subscribe = false }) {
    const Bridge = window.WebOSServiceBridge || window.PalmServiceBridge
    if (!Bridge) {
      const err = { returnValue: false, errorText: 'PalmServiceBridge unavailable' }
      if (onFailure) onFailure(err)
      if (onComplete) onComplete(err)
      return this
    }
    const bridge = new Bridge()
    const keep = subscribe || parameters.subscribe
    this.bridge = bridge
    live.add(this)
    bridge.onservicecallback = (msg) => {
      let res
      try {
        res = JSON.parse(msg)
      } catch (e) {
        res = { returnValue: false, errorText: 'bad response' }
      }
      if (res.returnValue === false || res.errorCode) {
        if (onFailure) onFailure(res)
      } else if (onSuccess) onSuccess(res)
      if (onComplete) onComplete(res)
      if (!keep) this.cancel()
    }
    const params = subscribe ? { ...parameters, subscribe: true } : parameters
    const uri = `${service.replace(/\/$/, '')}/${method}`
    bridge.call(uri, JSON.stringify(params))
    return this
  }

  cancel() {
    if (this.bridge && this.bridge.cancel) this.bridge.cancel()
    this.bridge = null
    live.delete(this)
  }
}
