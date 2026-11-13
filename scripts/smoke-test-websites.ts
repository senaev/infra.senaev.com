// Manual public website checks: npm run test:smoke
// Runs from any host with Bun; no Kubernetes context or credentials required.

type SmokeCheck = {
    url: string;
    expectedUrl: string;
};

type FinalResponse = {
    status: number;
    finalUrl: string;
};

// Each URL must answer 200 at the expected final URL. Together they cover the whole path of
// each kind of public request, down to obsidian-sync.
const CHECKS: SmokeCheck[] = [
    // Main page: firstvds Traefik (xray fallback) → nextjs-app.
    {
        url: 'https://senaev.ru',
        expectedUrl: 'https://senaev.ru/',
    },
    // Main page: hetzner Traefik (xray fallback) → nextjs-app.
    {
        url: 'https://senaev.com',
        expectedUrl: 'https://senaev.com/',
    },
    // Short link: cluster-helper → obsidian-sync, a redirect.
    {
        url: 'https://s.senaev.com/1bxsl9',
        expectedUrl: 'https://senaev.com/cv/5min',
    },
    // Static file: cluster-helper → obsidian-sync.
    {
        url: 'https://static.senaev.com/hello-world/',
        expectedUrl: 'https://static.senaev.com/hello-world/',
    },
    // Public note: nextjs-app → obsidian-sync.
    {
        url: 'https://senaev.com/notes/my_blog_post_senaev_speaks_12',
        expectedUrl: 'https://senaev.com/notes/my_blog_post_senaev_speaks_12',
    },
];

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;

// Redirects are followed by hand, so that every hop must be HTTPS and the hop count is limited.
async function fetchFinalResponse(url: string): Promise<FinalResponse> {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let currentUrl = new URL(url).href;

    for (let redirects = 0; ; redirects++) {
        if (new URL(currentUrl).protocol !== 'https:') {
            throw new Error(`redirect to a non-HTTPS URL ${currentUrl}`);
        }

        const response = await fetch(currentUrl, {
            redirect: 'manual',
            signal,
        });

        await response.body?.cancel();

        const location = response.headers.get('location');
        const isRedirect = response.status >= 300 && response.status < 400 && location !== null;

        if (!isRedirect) {
            return {
                status: response.status,
                finalUrl: currentUrl,
            };
        }

        if (redirects === MAX_REDIRECTS) {
            throw new Error(`more than ${MAX_REDIRECTS} redirects`);
        }

        currentUrl = new URL(location, currentUrl).href;
    }
}

/** Returns the report line of the check, starting with PASS or FAIL. */
async function runCheck({ url, expectedUrl }: SmokeCheck): Promise<string> {
    try {
        const { status, finalUrl } = await fetchFinalResponse(url);

        if (status === 200 && finalUrl === expectedUrl) {
            return `PASS ${url} -> ${finalUrl}`;
        }

        return `FAIL ${url}: expected 200 ${expectedUrl}; got ${status} ${finalUrl}`;
    } catch (error) {
        return `FAIL ${url}: request failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}

// The checks run concurrently; the report keeps the order of CHECKS.
const lines = await Promise.all(CHECKS.map(runCheck));
const failures = lines.filter((line) => line.startsWith('FAIL')).length;

for (const line of lines) {
    (line.startsWith('FAIL') ? process.stderr : process.stdout).write(`${line}\n`);
}

if (failures > 0) {
    process.stderr.write(`${failures} smoke check(s) failed\n`);
    process.exit(1);
}

process.stdout.write(`All ${CHECKS.length} website smoke checks passed\n`);
