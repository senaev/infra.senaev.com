const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");

const STATE_FILE = "/password-notify-state/webui-password-sent";
const SERVICE_ACCOUNT_TOKEN_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/token";
const SERVICE_ACCOUNT_CA_PATH = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
const MAX_ATTEMPTS = 120;
const POLL_INTERVAL_MS = 5000;
const PUBLISH_RETRY_INTERVAL_MS = 3000;
const PASSWORD_PATTERN = /temporary password is provided for this session: (.+)$/gm;

function sleep(ms) {
    console.log(`⏳ Sleeping for ${ms}ms...`);
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function waitForever() {
    console.log("⏳ Waiting indefinitely to keep node alive...");

    return new Promise(() => {
        // A pending Promise alone does not keep Node alive; we need an active handle
        // so the sidecar stays running after finishing its one-time publish work.
        setInterval(() => {}, 60 * 60 * 1000);
    });
}

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function requestText({ protocol, hostname, port, path, method, headers, ca, body }) {
    const transport = protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
        const req = transport.request(
            {
                protocol,
                hostname,
                port,
                path,
                method,
                headers,
                ca,
            },
            (res) => {
                let responseBody = "";

                res.setEncoding("utf8");
                res.on("data", (chunk) => {
                    responseBody += chunk;
                });
                res.on("end", () => {
                    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                        reject(
                            new Error(
                                `${method} ${protocol}//${hostname}${path} failed with status ${res.statusCode}: ${responseBody}`,
                            ),
                        );
                        return;
                    }

                    resolve(responseBody);
                });
            },
        );

        req.on("error", reject);

        if (body) {
            req.write(body);
        }

        req.end();
    });
}

async function fetchPodLogs() {
    console.log("🔍 Fetching pod logs to find qBittorrent WebUI temporary password...");
    const k8sHost = getRequiredEnv("KUBERNETES_SERVICE_HOST");
    const k8sPort = process.env.KUBERNETES_SERVICE_PORT_HTTPS || "443";
    const podName = getRequiredEnv("POD_NAME");
    const podNamespace = getRequiredEnv("POD_NAMESPACE");

    const token = fs.readFileSync(SERVICE_ACCOUNT_TOKEN_PATH, "utf8").trim();
    const ca = fs.readFileSync(SERVICE_ACCOUNT_CA_PATH, "utf8");
    const path = `/api/v1/namespaces/${podNamespace}/pods/${podName}/log?container=qbittorrent`;

    return requestText({
        protocol: "https:",
        hostname: k8sHost,
        port: k8sPort,
        path,
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        ca,
    });
}

function extractPassword(logs) {
    console.log("🔍 Extracting qBittorrent WebUI temporary password from logs...");
    const matches = Array.from(logs.matchAll(PASSWORD_PATTERN));
    return matches.at(-1)?.[1]?.trim() || "";
}

async function publishPassword(password) {
    console.log("🚀 Sending qBittorrent WebUI temporary password to cluster-helper...");
    const podName = getRequiredEnv("POD_NAME");
    const chatId = getRequiredEnv("TG_CLUSTER_CHAT_ID");
    const body = JSON.stringify({
        chatId,
        text: `qBittorrent WebUI password for <code>${escapeHtml(podName)}</code>:\n<tg-spoiler>${escapeHtml(password)}</tg-spoiler>`,
        parseMode: "HTML",
        replyMarkup: {
            inline_keyboard: [[{ text: "Copy", copy_text: { text: password } }]],
        },
    });

    return requestText({
        protocol: "http:",
        hostname: "cluster-helper",
        port: "80",
        path: "/telegram/send-message",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
        body,
    });
}

async function publishPasswordWithRetries(password) {
    console.log("🚀 Sending qBittorrent WebUI temporary password to cluster-helper...");

    for (let attempt = 1; ; attempt += 1) {
        try {
            const publishResult = await publishPassword(password);
            console.log(
                `✅ qBittorrent WebUI password send succeeded on retry=[${attempt}]`,
            );

            return publishResult;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            console.log(
                `⏳ qBittorrent WebUI password send failed, attempt=[${attempt}]: ${message}`,
            );

            await sleep(PUBLISH_RETRY_INTERVAL_MS);
        }
    }
}

async function main() {
    if (fs.existsSync(STATE_FILE)) {
        console.log("✅ qBittorrent WebUI password already published, waiting indefinitely");
        await waitForever();
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            const logs = await fetchPodLogs();
            const password = extractPassword(logs);

            if (!password) {
                console.log(
                    `⏳ qBittorrent WebUI password not found in logs yet, attempt=[${attempt}/${MAX_ATTEMPTS}]`,
                );
                await sleep(POLL_INTERVAL_MS);
                continue;
            }

            const publishResult = await publishPasswordWithRetries(password);
            fs.writeFileSync(STATE_FILE, "", { flag: "w" });
            console.log(`✅ qBittorrent WebUI temporary password published: ${publishResult}`);
            await waitForever();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(
                `⏳ Waiting for qBittorrent password, attempt=[${attempt}/${MAX_ATTEMPTS}]: ${message}`,
            );
            await sleep(POLL_INTERVAL_MS);
        }
    }

    console.log("✅ qBittorrent WebUI temporary password was not found in pod logs");
    await waitForever();
}

main().catch((error) => {
    console.error("❌ Error occurred:", error);
    process.exit(1);
});
