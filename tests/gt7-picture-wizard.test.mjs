// node --test tests/gt7-picture-wizard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPictureImport, PICTURE_BATCH_LIMIT } from '../js/model/gt7-picture-merge.js';
import { GT7_DEFAULT_AVATAR } from '../js/data/gt7-images.js';

const avatar = 'https://ugc.gt7.game.gran-turismo.com/23/123/foo_body.png';
const cover = 'https://ugc.gt7.game.gran-turismo.com/23/123/foo_cover.jpg';
const oldAvatar = 'https://ugc.gt7.game.gran-turismo.com/23/123/old_body.png';
const users = [{ uid: 'u1', gt7Guid: 'g1', gt7Avatar: oldAvatar, gt7Cover: cover }, { uid: 'u2', gt7Guid: 'g2', gt7Avatar: null, gt7Cover: null }];
const allowed = new Set(['g1', 'g2']);
const check = (rows, allow = allowed) => previewPictureImport(JSON.stringify(rows), users, allow);

test('does not erase existing pictures after an unsuccessful lookup', () => {
  const result = check([{ guid: 'g1', avatar: null, cover: null }]);
  assert.equal(result.ops.length, 0);
  assert.equal(result.empty, 1);
});

test('default avatar and missing cover do not replace real images', () => {
  const result = check([{ guid: 'g1', avatar: GT7_DEFAULT_AVATAR, cover: null }]);
  assert.equal(result.ops.length, 0);
  assert.equal(result.unchanged, 1);
});

test('updates only changed, valid image fields', () => {
  const result = check([{ guid: 'g1', avatar, cover }]);
  assert.deepEqual(result.ops, [{ path: ['users', 'u1'], data: { gt7Avatar: avatar }, merge: true }]);
});

test('permits cover-only update without erasing an existing avatar', () => {
  const result = check([{ guid: 'g2', avatar: null, cover }]);
  assert.deepEqual(result.ops, [{ path: ['users', 'u2'], data: { gt7Cover: cover }, merge: true }]);
});

test('rejects unrelated drivers and duplicate GUIDs', () => {
  const result = check([{ guid: 'g1', avatar }, { guid: 'g1', avatar }, { guid: 'g2', avatar }], new Set(['g2']));
  assert.deepEqual(result.ops.map((op) => op.path[1]), ['u2']);
  assert.equal(result.unknown, 1);
  assert.equal(result.duplicates, 1);
});

test('rejects non-HTTPS, external and non-URL values', () => {
  const result = check([{ guid: 'g1', avatar: 'javascript:alert(1)', cover: 'https://evil.example/image.png' }]);
  assert.equal(result.ops.length, 0);
});

test('rejects malformed, empty or oversized paste data', () => {
  assert.throws(() => previewPictureImport('{invalid', users, allowed));
  assert.throws(() => check([]));
  assert.throws(() => check(new Array(PICTURE_BATCH_LIMIT + 1).fill({ guid: 'g1', avatar })));
});
