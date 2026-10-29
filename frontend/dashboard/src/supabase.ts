import { createClient } from '@supabase/supabase-js';

import { supabaseUrl, supabaseAnonKey, apiUrl } from './config';

/** Shared Supabase Auth client for browser sessions and OAuth callbacks. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Add the current Supabase access token to a protected API request. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set('Authorization', `Bearer ${data.session.access_token}`);
  }
  let target = input;
  if (apiUrl && typeof input === 'string' && input.startsWith('/')) {
    target = `${apiUrl}${input}`;
  }
  return fetch(target, { ...init, headers });
}
