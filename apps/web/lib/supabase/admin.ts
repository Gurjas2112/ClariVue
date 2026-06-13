// Service-role Supabase client — bypasses RLS. SERVER-ONLY.
// Never import this into a Client Component or expose the key to the browser.
// This is the single path through which anonymous customers' validated reads/writes
// reach the database (after invite validation in the API route).
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
