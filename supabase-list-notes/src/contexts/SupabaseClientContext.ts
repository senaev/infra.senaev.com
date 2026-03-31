import { createClient } from "@supabase/supabase-js";

type SupabaseClientContextType =
    | {
          status: "require-credentials";
      }
    | {
          status: "wrong-credentials";
      }
    | {
          status: "ready";
          client: ReturnType<typeof createClient>;
      };

export const supabase = createClient(supabaseUrl, supabaseKey);
