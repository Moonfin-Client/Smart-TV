// The server burns PGS in for Roku, so the canvas renderer refuses to start.
export class PgsRenderer {
  constructor() {
    throw new Error('PGS is burned in on Roku')
  }
}
