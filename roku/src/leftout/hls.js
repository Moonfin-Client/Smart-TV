// Roku's own player plays HLS, so hls.js reports it can't run here and callers take their fallback.
export default class Hls {
  static isSupported() {
    return false
  }
}
