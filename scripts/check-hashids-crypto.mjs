import assert from 'node:assert/strict';
import Hashids from 'hashids';
import {
  ENABLE_HASHIDS,
  HASHIDS_ALPHABET,
  transformHashids
} from '../legacy/core/hashidsEngine.js';
import { DEFAULT_SETTINGS } from '../legacy/core/types.js';

const defaultProject = DEFAULT_SETTINGS.decryptConfig.projects[0];
const mulanProject = DEFAULT_SETTINGS.decryptConfig.projects[1];
const yangaiProject = DEFAULT_SETTINGS.decryptConfig.projects[2];
const config = { salt: defaultProject.salt, minLength: Number(defaultProject.minLength) };
const mulanConfig = { salt: mulanProject.salt, minLength: Number(mulanProject.minLength) };
const yangaiConfig = { salt: yangaiProject.salt, minLength: Number(yangaiProject.minLength) };

assert.equal(ENABLE_HASHIDS, true);
assert.equal(HASHIDS_ALPHABET, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
assert.equal(DEFAULT_SETTINGS.decryptConfig.selectedProjectIds[0], defaultProject.id);
assert.deepEqual(defaultProject, {
  id: 'hashids_international_refactor',
  name: '国际版重构',
  salt: 'gVTrpynQDcIGQKBgQDdC6mpDhGq0jq1exh',
  minLength: '6'
});
assert.equal(DEFAULT_SETTINGS.decryptConfig.selectedProjectIds[1], mulanProject.id);
assert.deepEqual(mulanProject, {
  id: 'hashids_jiayou_mulan',
  name: '加油木兰',
  salt: 'pm_basic',
  minLength: '6'
});
assert.equal(DEFAULT_SETTINGS.decryptConfig.selectedProjectIds[2], yangaiProject.id);
assert.deepEqual(yangaiProject, {
  id: 'hashids_yangai',
  name: '扬爱',
  salt: 'pm_basic',
  minLength: '6'
});

const reference = new Hashids(config.salt, config.minLength, HASHIDS_ALPHABET);
for (const value of ['0', '1', '123', '9007199254740993']) {
  const encrypted = transformHashids({ operation: 'encrypt', value, ...config });
  assert.equal(encrypted, reference.encodeHex(value));
  assert.ok(encrypted.length >= config.minLength);
  assert.equal(
    transformHashids({ operation: 'decrypt', value: encrypted, ...config }),
    value
  );
}

assert.equal(transformHashids({ operation: 'encrypt', value: '1336', ...config }), '458kWq');
assert.equal(transformHashids({ operation: 'decrypt', value: '458kWq', ...config }), '1336');
assert.equal(transformHashids({ operation: 'encrypt', value: '1336', ...mulanConfig }), '8PgMv0');
assert.equal(transformHashids({ operation: 'decrypt', value: '8PgMv0', ...mulanConfig }), '1336');
assert.equal(transformHashids({ operation: 'encrypt', value: '1336', ...yangaiConfig }), '8PgMv0');
assert.equal(transformHashids({ operation: 'decrypt', value: '8PgMv0', ...yangaiConfig }), '1336');

assert.throws(
  () => transformHashids({ operation: 'encrypt', value: '12.3', ...config }),
  /非负整数/
);
assert.throws(
  () => transformHashids({ operation: 'decrypt', value: 'invalid', ...config }),
  { message: '密文与当前项目配置不匹配' }
);
assert.throws(
  () => transformHashids({ operation: 'decrypt', value: 'invalid_value', ...config }),
  { message: '密文包含不支持的字符' }
);
assert.throws(
  () => transformHashids({ operation: 'encrypt', value: '1', salt: '', minLength: 6 }),
  /盐值不能为空/
);

console.log('Hashids crypto checks passed');
