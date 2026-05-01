import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request cached auth.getUser. React cache() dedupes within a single
 * server request so multiple callers (page, layout, helper) share one
 * round-trip ke Supabase.
 */
export const getCachedUser = cache(async (): Promise<User | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
