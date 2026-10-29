/** Browser-safe configuration only. Never import server secrets here. */
export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const apiUrl = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');

export function configurationError(): string | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the root .env file, then restart the dashboard.';
  }
  try {
    const url = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.endsWith('.invalid')) throw new Error();
  } catch {
    return 'VITE_SUPABASE_URL must be the HTTP or HTTPS URL of your Supabase project.';
  }
  if (supabaseAnonKey.startsWith('sb_secret_')) {
    return 'Use the public Supabase client key for VITE_SUPABASE_ANON_KEY.';
  }
  try {
    const payload = supabaseAnonKey.split('.')[1];
    if (payload && JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') {
      return 'Use the public Supabase client key for VITE_SUPABASE_ANON_KEY.';
    }
  } catch { /* Legacy anon keys and publishable keys use different formats. */ }
  return null;
}
