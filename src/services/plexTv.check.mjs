// A Plex address found on the network goes after plex.tv's https address for the same IP and port.
//   node --conditions=browser src/services/plexTv.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { withAddressesFirst } = await import('./plexTv.js')

const https = 'https://192-168-1-5.hash.plex.direct:32400'
const lan = 'http://192.168.1.5:32400'
const remote = 'https://45-1-2-3.hash.plex.direct:32400'
const listed = [remote, https, lan]
assert.deepEqual(withAddressesFirst(listed, [lan]), [https, lan, remote])
// Another IP, another port, or nothing listed for the IP (Docker, NAT) keeps the found address first.
assert.deepEqual(withAddressesFirst(listed, ['http://10.0.0.7:32400']), ['http://10.0.0.7:32400', ...listed])
assert.deepEqual(withAddressesFirst(listed, ['http://192.168.1.5:8080']), ['http://192.168.1.5:8080', ...listed])
const docker = 'http://172.17.0.2:32400'
assert.deepEqual(withAddressesFirst([docker], ['http://192.168.50.45:32400']), ['http://192.168.50.45:32400', docker])
// A saved https address stays first, and nothing is listed twice.
assert.deepEqual(withAddressesFirst([https, lan], [https, lan]), [https, lan])

console.log('plexTv ok')
