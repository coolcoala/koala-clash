import assert from 'node:assert/strict'
import test from 'node:test'
import { userScopedSocketPath } from './userScopedSocketPath'

test('scopes Unix socket paths by user when a uid is provided', () => {
  assert.equal(
    userScopedSocketPath('koala-clash-mihomo-api', 501),
    '/tmp/koala-clash-mihomo-api-501.sock'
  )
  assert.equal(userScopedSocketPath('koala-clash-mihomo-api'), '/tmp/koala-clash-mihomo-api.sock')
})
