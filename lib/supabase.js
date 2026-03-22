const { createClient } = require("@supabase/supabase-js");
const { getEnv } = require("./getEnv");

let _client = null;
let _adminClient = null;

function getSupabaseClient() {
  if (_client) return _client;

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY are required. Add them to .env.local and restart the server."
    );
  }

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

/** Server-only. Bypasses RLS. Use for knowledge_folders and other server-side writes. */
function getSupabaseAdminClient() {
  if (_adminClient) return _adminClient;
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && supabaseUrl) {
    _adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _adminClient;
  }
  return getSupabaseClient();
}

module.exports = { getSupabaseClient, getSupabaseAdminClient };
