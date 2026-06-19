import { readFile } from "node:fs/promises";
import { PROWLARR_CONFIG_FILE, PROWLARR_URL } from "./env";
import { logger } from "./logger";

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
        logger.info("✅ Using cached Prowlarr API key");
        return cachedApiKey;
    }

    logger.info({ configFile: PROWLARR_CONFIG_FILE }, "👉 Reading Prowlarr API key from config file");
    const config = await readFile(PROWLARR_CONFIG_FILE, "utf8");
    const apiKey = config.match(/<ApiKey>([^<]+)<\/ApiKey>/)?.[1];
    if (!apiKey) {
        throw new Error(
            `❌ Could not find Prowlarr ApiKey in [${PROWLARR_CONFIG_FILE}] [${config}]`,
        );
    }

    cachedApiKey = apiKey;
    logger.info("✅ Read Prowlarr API key from config");

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
    logger.info({ method, path }, "👉 Calling Prowlarr API");
    const apiKey = await getProwlarrApiKey();

    const response = await fetch(`${PROWLARR_URL}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });

    const rawBody = await response.text();

    if (!response.ok) {
        logger.error(
            { method, path, status: response.status },
            "❌ Prowlarr API call failed",
        );
        throw new Error(
            `❌ Prowlarr API ${method} ${path} failed: HTTP ${response.status} ${response.statusText}${rawBody ? ` - ${rawBody}` : ""}`,
        );
    }

    const result = (rawBody ? JSON.parse(rawBody) : undefined) as T;
    logger.info(
        { method, path, status: response.status, responseSize: rawBody.length, result },
        "✅ Prowlarr API call finished",
    );

    return result;
}

export async function searchProwlarr(query: string): Promise<ProwlarrRelease[]> {
    logger.info({ query }, "👉 Searching Prowlarr releases");
    const searchParams = new URLSearchParams({
        query,
        type: "search",
    });
    const releases = await prowlarrApiCall<ProwlarrRelease[]>({
        method: "GET",
        path: `/api/v1/search?${searchParams.toString()}`,
    });

    const sortedReleases = releases.sort((left, right) => {
        const rightSeeds = right.seeders ?? right.peers ?? 0;
        const leftSeeds = left.seeders ?? left.peers ?? 0;

        return rightSeeds - leftSeeds;
    });
    logger.info({ query, count: sortedReleases.length }, "✅ Finished Prowlarr search");

    return sortedReleases;
}

export async function downloadProwlarrRelease(release: ProwlarrRelease): Promise<void> {
    logger.info({ title: release.title ?? "Untitled" }, "👉 Sending Prowlarr release to download");
    await prowlarrApiCall<void>({
        method: "POST",
        path: "/api/v1/search",
        body: release,
    });
    logger.info({ title: release.title ?? "Untitled" }, "✅ Sent Prowlarr release to download");
}
