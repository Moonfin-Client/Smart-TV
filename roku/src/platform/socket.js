// The Xbox host socket has no Roku counterpart, so Silo's socket falls back to the page's own.
export class ShellSocket {
  constructor() {
    throw new Error('no host socket on Roku')
  }
}
