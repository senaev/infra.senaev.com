// Keep the password out of probe arguments, output and rendered manifests.
const password = process.env.OPENCODE_PASSWORD;

if (!password) {
    process.exit(1);
}

fetch('http://127.0.0.1:4096/api/info', {
    headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` },
    signal: AbortSignal.timeout(3000),
}).then(async (response) => {
    if (!response.ok) {
        process.exit(1);
    }

    const info = await response.json();

    if (typeof info.pid !== 'number' || typeof info.version !== 'string') {
        process.exit(1);
    }
}).catch(() => process.exit(1));
