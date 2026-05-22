import { readFile } from "node:fs/promises";
import { prettyStringify } from "senaev-utils/src/utils/prettyStringify";
import { PROWLARR_CONFIG_FILE, PROWLARR_URL } from "./env";

let cachedApiKey: string | undefined;

export interface ProwlarrRelease {
    age?: number;
    downloadUrl?: string;
    guid?: string;
    indexer?: string;
    indexerId?: number;
    infoUrl?: string;
    leechers?: number;
    peers?: number;
    publishDate?: string;
    seeders?: number;
    size?: number;
    title?: string;
}

async function getProwlarrApiKey(): Promise<string> {
    if (cachedApiKey) {
        console.log("✅ Using cached Prowlarr API key");
        return cachedApiKey;
    }

    console.log(`👉 Reading Prowlarr API key from config file=[${PROWLARR_CONFIG_FILE}]`);
    const config = await readFile(PROWLARR_CONFIG_FILE, "utf8");
    const apiKey = config.match(/<ApiKey>([^<]+)<\/ApiKey>/)?.[1];
    if (!apiKey) {
        throw new Error(
            `❌ Could not find Prowlarr ApiKey in [${PROWLARR_CONFIG_FILE}] [${config}]`,
        );
    }

    cachedApiKey = apiKey;
    console.log("✅ Read Prowlarr API key from config");

    return apiKey;
}

async function prowlarrApiCall<T>({
    body,
    method,
    path,
}: {
    body?: unknown;
    method: "GET" | "POST";
    path: string;
}): Promise<T> {
    console.log(`👉 Calling Prowlarr API method=[${method}], path=[${path}]`);
    const apiKey = await getProwlarrApiKey();

    console.log("👉 Request prowlarr api");
    const response = await fetch(`${PROWLARR_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    const rawBody = await response.text();

    console.log(`✅ Request prowlarr api, response=[${prettyStringify(rawBody)}]`);

    if (!response.ok) {
        console.error(
            `❌ Prowlarr API call failed method=[${method}], path=[${path}], status=[${response.status}]`,
        );
        throw new Error(
            `❌ Prowlarr API ${method} ${path} failed: HTTP ${response.status} ${response.statusText}${rawBody ? ` - ${rawBody}` : ""}`,
        );
    }

    console.log(
        `✅ Prowlarr API call finished method=[${method}], path=[${path}], status=[${response.status}], responseSize=[${rawBody.length}]`,
    );
    return (rawBody ? JSON.parse(rawBody) : undefined) as T;
}

export async function searchProwlarr(query: string): Promise<ProwlarrRelease[]> {
    console.log(`👉 Searching Prowlarr releases query=[${query}]`);
    const searchParams = new URLSearchParams({
        query,
        type: "search",
    });
    const releases = await prowlarrApiCall<ProwlarrRelease[]>({
        method: "GET",
        path: `/api/v1/search?${searchParams.toString()}`,
    });

    console.log(`👉 Sorting Prowlarr releases count=[${releases.length}]`);
    const sortedReleases = releases.sort((left, right) => {
        const rightSeeds = right.seeders ?? right.peers ?? 0;
        const leftSeeds = left.seeders ?? left.peers ?? 0;

        return rightSeeds - leftSeeds;
    });
    console.log(`✅ Sorted Prowlarr releases count=[${sortedReleases.length}]`);
    console.log(`✅ Finished Prowlarr search query=[${query}], count=[${sortedReleases.length}]`);

    return sortedReleases;
}

export async function downloadProwlarrRelease(release: ProwlarrRelease): Promise<void> {
    console.log(`👉 Sending Prowlarr release to download title=[${release.title ?? "Untitled"}]`);
    await prowlarrApiCall<void>({
        method: "POST",
        path: "/api/v1/search",
        body: release,
    });
    console.log(`✅ Sent Prowlarr release to download title=[${release.title ?? "Untitled"}]`);
}
