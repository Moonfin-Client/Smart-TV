// A Continue Watching or Next Up tile on Samsung's Smart Hub raises moonfin:deepLink
// (platform/tizen/smarthub.js), and its title opens the way those cards do on Home. A tile left
// from another server is dropped. Null when there's nothing to open.
export const deepLinkItem = (link, user) => {
  if (!link || !link.id) return null
  if (link.serverId && user && user.ServerId && link.serverId !== user.ServerId) return null
  return { Id: link.id, Type: link.type === 'episode' ? 'Episode' : 'Movie' }
}
