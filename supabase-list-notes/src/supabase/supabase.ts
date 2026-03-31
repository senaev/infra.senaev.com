import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
    const value = import.meta.env[name as keyof ImportMetaEnv];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
const supabaseKey = requireEnv("VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseKey);
