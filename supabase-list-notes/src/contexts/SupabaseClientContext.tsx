import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createContext, PropsWithChildren, useContext, useRef } from "react";

export type SupabaseClientStatusObjectNotReady = {
    status: "require-credentials" | "wrong-credentials";
};

export type SupabaseClientStatusObjectReady = {
    status: "ready";
    client: SupabaseClient;
};

export type SupabaseClientContextType =
    | SupabaseClientStatusObjectNotReady
    | SupabaseClientStatusObjectReady;

const CONTEXT_VALUE_REQUIRE_CREDENTIALS = {
    status: "require-credentials",
} as const;

export const SupabaseClientContext = createContext<SupabaseClientContextType>(
    CONTEXT_VALUE_REQUIRE_CREDENTIALS,
);
SupabaseClientContext.displayName = "SupabaseClientContext";

type SupabaseCredentials = { supabaseUrl: string; supabaseKey: string };

const LOCAL_STORAGE_KEY = "supabase-credentials";
const initialLocalStorageCredentials = localStorage.getItem(LOCAL_STORAGE_KEY);

function parseLocalStorageCredentials(value: string | null): SupabaseCredentials | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value);

        const { supabaseUrl, supabaseKey } = parsed;
        if (typeof supabaseUrl === "string" && typeof supabaseKey === "string") {
            return { supabaseUrl, supabaseKey };
        }
    } catch (error) {
        //
    }

    return null;
}

const getSupabaseClientContextValue = (): SupabaseClientContextType => {
    const localStorageCredentialsRef = useRef<string | null>(initialLocalStorageCredentials);
    const localStorageCredentials = localStorageCredentialsRef.current;

    const supabaseClientRef = useRef<SupabaseClient | null>(null);
    let client = supabaseClientRef.current;
    let credentials: SupabaseCredentials | null = null;
    if (localStorageCredentials) {
        try {
            credentials = parseLocalStorageCredentials(localStorageCredentials);
        } catch (error) {
            //
        }
    }

    if (client) {
        return {
            status: "ready",
            client,
        };
    }

    if (!credentials) {
        return CONTEXT_VALUE_REQUIRE_CREDENTIALS;
    }

    client = createClient(credentials.supabaseUrl, credentials.supabaseKey);
    supabaseClientRef.current = client;

    return {
        status: "ready",
        client,
    };
};

export const SupabaseClientContextProvider = ({ children }: PropsWithChildren) => {
    const contextValue = getSupabaseClientContextValue();

    return (
        <SupabaseClientContext.Provider value={contextValue}>
            {children}
        </SupabaseClientContext.Provider>
    );
};

export const useSupabaseClientContext = (): SupabaseClientContextType => {
    return useContext(SupabaseClientContext);
};
