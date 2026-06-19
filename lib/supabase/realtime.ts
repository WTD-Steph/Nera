import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

/**
 * Authenticate the realtime socket with the current session token BEFORE
 * subscribing to any RLS-protected channel.
 *
 * createBrowserClient loads the session from cookies asynchronously, so
 * calling channel.subscribe() in the same tick (as the realtime components
 * used to) races ahead of auth: the socket joins anonymously, RLS on the
 * table silently blocks every event, and the subscription delivers nothing
 * (it times out). Awaiting this first makes postgres_changes actually fire.
 */
export async function authenticateRealtime(
  supabase: BrowserSupabaseClient,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    await supabase.realtime.setAuth(session.access_token);
  }
}
