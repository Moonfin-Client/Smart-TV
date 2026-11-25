// Which request actions a viewer gets. canManage is seerrApi.canManageRequests on the /auth/me
// permissions, since the status call claims every permission when it leaves them out. me is the
// viewer's Seerr user id.
import { REQUEST_STATUS, ISSUE_STATUS } from '../../utils/seerrStatus.js'
import { cancelableRequests } from '../../utils/seerrRequestRules.js'

// A tile on the requests screen: a moderator answers a waiting request or retries a failed one,
// and anyone else can take back their own while it waits.
export const tileActions = (request, { canManage, me }) => {
  const own = me != null && !!request.requestedBy && request.requestedBy.id === me
  if (request.status === REQUEST_STATUS.PENDING) return canManage ? ['approve', 'decline'] : own ? ['cancel'] : []
  return request.status === REQUEST_STATUS.FAILED && canManage ? ['retry'] : []
}

// An issue: a moderator or its reporter can resolve, reopen and comment, and its reporter can
// delete it only while nobody has replied.
export const issueActions = (issue, { canManageIssues, me }) => {
  const creator = me != null && !!issue.createdBy && issue.createdBy.id != null && issue.createdBy.id === me
  const canAct = !!canManageIssues || creator
  return {
    canAct,
    canDelete: !!canManageIssues || (creator && ((issue.comments && issue.comments.length) || 0) <= 1),
    toggle: canAct ? (issue.status === ISSUE_STATUS.OPEN ? 'resolve' : 'reopen') : null,
  }
}

// A title's own page: what each track's Cancel takes back (a moderator's takes back any open
// request, so it doubles as delete), and what Manage Requests answers.
export const titleActions = (requests, { canManage, me }) => {
  const list = requests || []
  const active = list.filter((r) => r.status === REQUEST_STATUS.PENDING || r.status === REQUEST_STATUS.APPROVED)
  const cancelable = (is4k) =>
    cancelableRequests(active.filter((r) => !!r.is4k === is4k), { canManageRequests: canManage, currentUserId: me })
  return {
    cancelHd: cancelable(false),
    cancel4k: cancelable(true),
    pending: canManage ? list.filter((r) => r.status === REQUEST_STATUS.PENDING) : [],
  }
}
