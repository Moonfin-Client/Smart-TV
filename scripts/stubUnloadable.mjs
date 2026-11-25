import { registerHooks } from 'node:module'

// For a node check of a module that reaches the locale and server code: JSON, and any package node
// can't load, come back as empty modules, and relative imports get their .js.
export const stubUnloadable = () =>
  registerHooks({
    resolve(spec, ctx, next) {
      if (spec.endsWith('.json')) return { url: 'data:text/javascript,export default {}', shortCircuit: true }
      else if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
      else if (!spec.startsWith('.') && !spec.startsWith('node:') && !spec.startsWith('file:')) {
        try {
          return next(spec, ctx)
        } catch (e) {
          return { url: 'data:text/javascript,export default {}', shortCircuit: true }
        }
      }
      return next(spec, ctx)
    },
  })
