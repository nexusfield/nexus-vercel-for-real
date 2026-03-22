import { createClient } from "@supabase/supabase-js";
const { getEnv } = require("./getEnv");

const supabaseUrl = getEnv("SUPABASE_URL");
const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_ANON_KEY are required. Add them to .env.local and restart the server."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
