import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const loopback = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const placeholder = (value) => /your[-_ ]|replace[-_ ]?me|<[^>]+>|example\.invalid/i.test(value);

function publicKeyError(value) {
  if (value.startsWith('sb_secret_')) return true;
  try {
    return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'service_role';
  } catch { return false; }
}

/** Pure validation: messages mention variable names, never their values. */
export function validateEnvironment(server, browser = server, { docker = false } = {}) {
  const errors = [];
  const warnings = [];
  for (const name of required) {
    const value = (name.startsWith('VITE_') ? browser[name] : server[name])?.trim();
    if (!value || placeholder(value)) errors.push(`Set ${name} to a real development-project value in the root .env.`);
  }
  for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'DOCKER_SUPABASE_URL', 'FRONTEND_URL']) {
    const value = (name.startsWith('VITE_') ? browser[name] : server[name])?.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
      if (url.protocol === 'http:' && !loopback(url.hostname) && url.hostname !== 'host.docker.internal') {
        errors.push(`${name} must use HTTPS outside local development.`);
      }
    } catch { errors.push(`${name} must be an HTTP(S) origin without a path, credentials, or query.`); }
  }
  for (const [serverKey, browserKey] of [['SUPABASE_URL', 'VITE_SUPABASE_URL'], ['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY']]) {
    if (server[serverKey]?.trim().replace(/\/$/, '') !== browser[browserKey]?.trim().replace(/\/$/, '')) {
      errors.push(`${serverKey} and ${browserKey} must match (same Supabase project). Check .env.local and shell overrides too.`);
    }
  }
  for (const [name, value] of Object.entries({ ...server, ...browser })) {
    if ((name.startsWith('VITE_') || name === 'SUPABASE_ANON_KEY') && value && publicKeyError(value)) {
      errors.push(`${name} contains a server secret. Use the public anon/publishable key and rotate any exposed secret.`);
    }
    if (name.startsWith('VITE_') && /PASSWORD|SECRET|SERVICE_ROLE|DATABASE_URL/.test(name)) {
      errors.push(`Remove ${name}: VITE_ variables are public browser configuration.`);
    }
  }
  for (const name of ['DATABASE_URL', 'DOCKER_DATABASE_URL']) {
    if (!server[name]?.trim()) continue;
    try {
      const url = new URL(server[name]);
      if (url.protocol !== 'postgresql+psycopg:' || !url.hostname || !url.username || !url.password || url.pathname.length < 2) throw Error();
      if (url.port === '6543') warnings.push(`${name} appears to use transaction pooling; use a direct or session-pooler URL for Alembic.`);
    } catch { errors.push(`${name} must be a postgresql+psycopg://user:encoded-password@host:port/database URL.`); }
  }
  if (docker) {
    for (const [override, base] of [['DOCKER_DATABASE_URL', 'DATABASE_URL'], ['DOCKER_SUPABASE_URL', 'SUPABASE_URL']]) {
      try {
        if (loopback(new URL(server[override] || server[base]).hostname)) {
          errors.push(`Set ${override} to reach the host via host.docker.internal; container localhost is the API container itself.`);
        }
      } catch { /* Reported above. */ }
    }
  }
  if (Boolean(server.GOOGLE_SMTP_EMAIL) !== Boolean(server.GOOGLE_APP_PASSWORD)) {
    errors.push('Set both GOOGLE_SMTP_EMAIL and GOOGLE_APP_PASSWORD, or leave both blank.');
  }
  if (server.SMTP_PORT && (!/^\d+$/.test(server.SMTP_PORT) || Number(server.SMTP_PORT) < 1 || Number(server.SMTP_PORT) > 65535)) {
    errors.push('SMTP_PORT must be an integer between 1 and 65535.');
  }
  if (!server.GOOGLE_SMTP_EMAIL) warnings.push('FastAPI OTP email delivery is disabled until GOOGLE_SMTP_EMAIL and GOOGLE_APP_PASSWORD are set. Supabase Auth email settings are separate.');
  if (!server.FRONTEND_URL) warnings.push('FRONTEND_URL is blank; the API defaults to http://localhost:5173.');
  return { errors, warnings };
}

export function duplicateKeys(source) {
  const seen = new Set();
  const duplicates = new Set();
  for (const line of source.split(/\r?\n/)) {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}

function main() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) {
    console.error('Setup error: copy .env.example to the root .env, fill the five required values, and follow SETUP.md.');
    return 1;
  }
  const source = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const errors = duplicateKeys(source).map((key) => `Define ${key} only once in .env.`);
  // Pydantic reads .env plus process variables; Vite also reads mode/local files.
  const server = { ...parseEnv(source), ...process.env };
  const browser = loadEnv('development', root, 'VITE_');
  const result = validateEnvironment(server, browser, { docker: process.argv.includes('--docker') });
  errors.push(...result.errors);
  for (const message of result.warnings) console.warn(`Setup warning: ${message}`);
  for (const message of errors) console.error(`Setup error: ${message}`);
  if (errors.length) return 1;
  console.log('Environment checks passed. Credentials were not printed. Database connectivity and migration state are checked separately; see SETUP.md.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch { console.error('Setup error: cannot parse environment files. Check the root .env and SETUP.md.'); process.exitCode = 1; }
}
