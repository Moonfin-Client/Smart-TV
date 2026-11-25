// Self-check for requestActions.js: node src/pages/Seerr/requestActions.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { tileActions, titleActions, issueActions } = await import('./requestActions.js')

const PENDING = 1
const APPROVED = 2
const DECLINED = 3
const FAILED = 4
const req = (id, status, by, is4k = false) => ({ id, status, is4k, requestedBy: by == null ? null : { id: by } })
const admin = { canManage: true, me: 1 }
const viewer = { canManage: false, me: 2 }

assert.deepEqual(tileActions(req(1, PENDING, 2), admin), ['approve', 'decline'])
assert.deepEqual(tileActions(req(1, PENDING, 2), viewer), ['cancel'], 'a viewer takes back their own waiting request')
assert.deepEqual(tileActions(req(1, PENDING, 3), viewer), [], 'but not anyone else\'s')
assert.deepEqual(tileActions(req(1, PENDING, null), { canManage: false, me: null }), [], 'an unknown viewer owns nothing')
assert.deepEqual(tileActions(req(1, APPROVED, 2), viewer), [], 'an approved request is past taking back here')
assert.deepEqual(tileActions(req(1, APPROVED, 2), admin), [])
assert.deepEqual(tileActions(req(1, FAILED, 2), admin), ['retry'])
assert.deepEqual(tileActions(req(1, FAILED, 2), viewer), [])
assert.deepEqual(tileActions(req(1, DECLINED, 2), admin), [])

const requests = [req(1, PENDING, 2), req(2, APPROVED, 3), req(3, PENDING, 3, true), req(4, DECLINED, 2), req(5, APPROVED, 2, true)]
const forAdmin = titleActions(requests, admin)
assert.deepEqual(forAdmin.cancelHd.map((r) => r.id), [1, 2], 'a moderator can take back any open HD request')
assert.deepEqual(forAdmin.cancel4k.map((r) => r.id), [3, 5])
assert.deepEqual(forAdmin.pending.map((r) => r.id), [1, 3])
const forViewer = titleActions(requests, viewer)
assert.deepEqual(forViewer.cancelHd.map((r) => r.id), [1], 'a viewer only their own waiting request')
assert.deepEqual(forViewer.cancel4k, [], 'their approved 4K request is out of reach')
assert.deepEqual(forViewer.pending, [], 'nothing to manage without the permission')
assert.deepEqual(titleActions(undefined, admin), { cancelHd: [], cancel4k: [], pending: [] })

const issue = (status, by, comments) => ({ id: 9, status, createdBy: { id: by }, comments: Array.from({ length: comments }, (_, i) => ({ id: i })) })
assert.deepEqual(issueActions(issue(1, 3, 2), { canManageIssues: true, me: 1 }), { canAct: true, canDelete: true, toggle: 'resolve' })
assert.deepEqual(issueActions(issue(2, 3, 2), { canManageIssues: true, me: 1 }), { canAct: true, canDelete: true, toggle: 'reopen' })
assert.deepEqual(issueActions(issue(1, 2, 1), { canManageIssues: false, me: 2 }), { canAct: true, canDelete: true, toggle: 'resolve' }, 'a reporter before any reply')
assert.deepEqual(issueActions(issue(1, 2, 2), { canManageIssues: false, me: 2 }), { canAct: true, canDelete: false, toggle: 'resolve' }, 'a reporter once someone replied')
assert.deepEqual(issueActions(issue(1, 3, 1), { canManageIssues: false, me: 2 }), { canAct: false, canDelete: false, toggle: null }, 'someone else')
assert.deepEqual(issueActions({ status: 1, createdBy: null }, { canManageIssues: false, me: null }), { canAct: false, canDelete: false, toggle: null })

console.log('requestActions ok')
