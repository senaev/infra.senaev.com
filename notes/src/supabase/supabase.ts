import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

const supabaseUrl = requireEnv("REACT_APP_SUPABASE_URL");
const supabaseKey = requireEnv("REACT_APP_SUPABASE_ANON_KEY");

export const supabase = createClient(supabaseUrl, supabaseKey);
