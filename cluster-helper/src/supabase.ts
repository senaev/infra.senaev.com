import { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } from './env';

const SUPABASE_WRITE_TIMEOUT_MS = 30_000;

export async function insertSupabaseRows(
    table: string,
    rows: Record<string, unknown> | Record<string, unknown>[]
): Promise<void> {
    const response = await fetch(`${SUPABASE_PROJECT_URL}/rest/v1/${table}`, {
        method: 'POST',
        // Keep the deadline active while the HTTP response body is read, too.
        signal: AbortSignal.timeout(SUPABASE_WRITE_TIMEOUT_MS),
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
    });

    if (!response.ok) {
        throw new Error(`Failed to insert into ${table}: ${response.status} ${await response.text()}`);
    }
}
