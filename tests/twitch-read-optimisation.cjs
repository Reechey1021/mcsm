// Mocked Cloud Run smoke test: only stream-enabled profiles are queried and results
// include minimal public display information, without fetching all drivers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'functions/index.js'), 'utf8');
let handler, indexReads = 0, allUsersReads = 0, writes = 0, tokenRequests = 0, streamRequests = 0;
const old = { at: Date.now() - 120000, streams: [{ login: 'test_channel' }] };
let liveDoc = { ...old };
const users = [
  { id: 'driver1', data: () => ({ streamUrl: 'https://twitch.tv/test_channel', firstName: 'Test', lastName: 'Driver', gt7Avatar: 'https://example.test/avatar.png', psn: 'Driver1', teamId: 'team1' }) },
  { id: 'driver2', data: () => ({ streamUrl: 'second_channel', psn: 'Driver2' }) },
  { id: 'driver3', data: () => ({ streamUrl: 'https://youtube.com/someone', psn: 'Driver3' }) },
];
const db = {
  doc(name) {
    if (name !== 'content/live') throw new Error(`Unexpected document read: ${name}`);
    return {
      get: async () => ({ data: () => liveDoc }),
      set: async (patch) => { liveDoc = { ...liveDoc, ...patch }; writes++; },
    };
  },
  collection(name) {
    if (name !== 'users') throw new Error(`Unexpected collection ${name}`);
    return {
      get: async () => { allUsersReads++; throw new Error('Never query the entire users directory'); },
      where(field, op, value) {
        assert.deepEqual([field, op, value], ['streamUrl', '>', '']);
        indexReads++;
        return { get: async () => ({ forEach: (fn) => users.forEach((u) => { if (u.data().streamUrl > '') fn(u); }) }) };
      },
    };
  },
};
const admin = { initializeApp() {}, firestore: () => db };
const framework = { http(name, fn) { assert.equal(name, 'mcsmAdmin'); handler = fn; } };
const mockRequire = (id) => {
  if (id === '@google-cloud/functions-framework') return framework;
  if (id === 'firebase-admin') return admin;
  throw new Error(id);
};
const fakeFetch = async (url) => {
  if (url.includes('oauth2/token')) { tokenRequests++; return { ok: true, json: async () => ({ access_token: 'test', expires_in: 3600 }) }; }
  if (url.includes('helix/streams')) {
    streamRequests++;
    assert(url.includes('user_login=test_channel'));
    assert(url.includes('user_login=second_channel'));
    assert(!url.includes('driver3'));
    return { ok: true, json: async () => ({ data: [{ user_login: 'test_channel', user_name: 'Test_channel', title: 'Test race', viewer_count: 5, thumbnail_url: 'https://example.test/{width}/{height}' }] }) };
  }
  throw new Error('Unexpected fetch ' + url);
};
const env = { TWITCH_CLIENT_ID: 'test_id', TWITCH_CLIENT_SECRET: 'test_secret' };
new Function('require', 'process', 'fetch', source)(mockRequire, { env }, fakeFetch);
const request = { method: 'POST', body: { action: 'twitchLive' }, get: () => 'https://mcsm.hu' };
const response = () => ({ set() { return this; }, json(data) { this.result = data; return this; }, status(status) { this.code = status; return this; } });
(async () => {
  const results = await Promise.all([handler(request, response()), handler(request, response())]);
  const stream = results[0].result.streams[0];
  assert.equal(indexReads, 1, 'Concurrent calls must share a single Twitch query');
  assert.equal(allUsersReads, 0, 'Must never scan every driver');
  assert.equal(stream.profile.psn, 'Driver1');
  assert.equal(stream.profile.gt7Avatar, 'https://example.test/avatar.png');
  assert.equal(stream.profile.lastName, 'Driver');
  assert.equal(tokenRequests, 1);
  assert.equal(streamRequests, 1);
  assert(writes >= 1);
  await handler(request, response());
  assert.equal(indexReads, 1, '90-second cached response should not scan channels again');
  console.log('Twitch reduced-read Cloud Run mock passed.');
})().catch((e) => { console.error(e); process.exit(1); });
