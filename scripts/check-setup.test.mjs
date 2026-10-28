import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateKeys, validateEnvironment } from './check-setup.mjs';

const valid = {
  DATABASE_URL: 'postgresql+psycopg://postgres:encoded%40password@db.dev.supabase.co:5432/postgres?sslmode=require',
  SUPABASE_URL: 'https://dev.supabase.co',
  SUPABASE_ANON_KEY: 'public-key',
  VITE_SUPABASE_URL: 'https://dev.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-key',
};
test('matching hosted configuration works with native and Docker paths', () => {
  assert.deepEqual(validateEnvironment(valid).errors, []);
  assert.deepEqual(validateEnvironment(valid, valid, { docker: true }).errors, []);
});
test('blank template reports every required setting without exposing values', () => {
  assert.equal(validateEnvironment({}).errors.filter((e) => e.startsWith('Set ')).length, 5);
});
test('browser overrides cannot silently select another project', () => {
  assert.match(validateEnvironment(valid, { ...valid, VITE_SUPABASE_URL: 'https://other.supabase.co' }).errors.join(), /must match/);
});
test('server secrets are rejected from public variables without printing them', () => {
  const secret = 'sb_secret_private-example';
  const result = validateEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: secret });
  assert.match(result.errors.join(), /server secret/);
  assert.ok(!result.errors.join().includes(secret));
  const jwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`;
  assert.match(validateEnvironment({ ...valid, VITE_SUPABASE_ANON_KEY: jwt }).errors.join(), /server secret/);
});
test('Docker loopback requires explicit host overrides for a full local Supabase stack', () => {
  const local = { ...valid, DATABASE_URL: 'postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres', SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' };
  assert.deepEqual(validateEnvironment(local).errors, []);
  assert.equal(validateEnvironment(local, local, { docker: true }).errors.length, 2);
  const overridden = { ...local, DOCKER_DATABASE_URL: 'postgresql+psycopg://postgres:postgres@host.docker.internal:54322/postgres', DOCKER_SUPABASE_URL: 'http://host.docker.internal:54321' };
  assert.deepEqual(validateEnvironment(overridden, overridden, { docker: true }).errors, []);
});
test('reject malformed URLs, incomplete SMTP, and unsafe public variable names', () => {
  const result = validateEnvironment({ ...valid, DATABASE_URL: 'broken', SUPABASE_URL: 'https://dev.supabase.co/path', GOOGLE_SMTP_EMAIL: 'sender@example.invalid', VITE_DATABASE_URL: 'hidden-value', SMTP_PORT: 'abc' });
  assert.equal(result.errors.length, 6);
  assert.ok(!result.errors.join().includes('hidden-value'));
});
test('detect duplicate assignments including exports and empty values', () => {
  assert.deepEqual(duplicateKeys('# A=ignored\nA=one\nexport A=two\nB=\nB=three'), ['A', 'B']);
});
