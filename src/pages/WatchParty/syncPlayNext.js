// Makes the next Watch Parties dialog open on SyncPlay. Home's row sets it, and the dialog takes it
// as it opens.
let next = false

export const openSyncPlay = (router) => {
  next = true
  router.to('/party')
}

export const takeSyncPlayNext = () => {
  const was = next
  next = false
  return was
}
