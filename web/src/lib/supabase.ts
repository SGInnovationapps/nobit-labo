import { createClient } from "@supabase/supabase-js";
import { DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const supabase = createClient(
  SUPABASE_URL || "http://localhost:54321",
  SUPABASE_ANON_KEY || "demo-anon-key",
  { auth: { persistSession: !DEMO, autoRefreshToken: !DEMO, detectSessionInUrl: true } },
);
