import Fastify from "fastify";
import {
    PORT,
    SUBSCRIPTION_ENTRIES,
    VPN_SUBSCRIPTION_SECRET,
    XRAY_REALITY_PUBLIC_KEY,
    XRAY_USER_UUID,
} from "./env.js";

const server = Fastify({ logger: true });

const macroValues: Record<string, string> = {
    XRAY_REALITY_PUBLIC_KEY,
    XRAY_USER_UUID,
};

function replaceMacros(value: string): string {
    return value.replaceAll(/\{([A-Z0-9_]+)\}/g, (match, macroName: string) => {
        const replacement = macroValues[macroName];
        if (replacement === undefined) {
            throw new Error(`Unsupported macro: ${match}`);
        }

        return replacement;
    });
}

function withName(link: string, name: string): string {
    const [baseLink] = link.split("#", 1);
    return `${baseLink}#${encodeURIComponent(name)}`;
}

function isVpnUserAgent(userAgent: string): boolean {
    return userAgent.includes("Happ/") || userAgent.includes("HiddifyNext/");
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderInstructionsPage(subscriptionUrl: string): string {
    const happLink = `happ://add/${subscriptionUrl}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Install VPN</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f2efe8;
      --panel: rgba(255, 252, 246, 0.92);
      --text: #1c1a17;
      --muted: #5f5a52;
      --line: rgba(28, 26, 23, 0.12);
      --accent: #0f766e;
      --accent-strong: #115e59;
      --shadow: 0 20px 60px rgba(28, 26, 23, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 28%),
        radial-gradient(circle at bottom right, rgba(180, 83, 9, 0.14), transparent 24%),
        linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%);
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .card {
      width: min(760px, 100%);
      padding: 32px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: var(--panel);
      box-shadow: var(--shadow);
      backdrop-filter: blur(14px);
    }

    .eyebrow {
      margin: 0 0 10px;
      font-family: "Helvetica Neue", Helvetica, sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent-strong);
    }

    h1 {
      margin: 0 0 12px;
      font-size: clamp(38px, 7vw, 64px);
      line-height: 0.96;
      letter-spacing: -0.04em;
    }

    .lead {
      margin: 0 0 28px;
      font-size: 18px;
      line-height: 1.55;
      color: var(--muted);
      max-width: 42rem;
    }

    ol {
      margin: 0;
      padding-left: 24px;
    }

    li {
      margin: 0 0 22px;
      padding-left: 8px;
      font-size: 19px;
      line-height: 1.5;
    }

    a {
      color: var(--accent-strong);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 14px 0 0;
    }

    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 50px;
      padding: 0 18px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-family: "Helvetica Neue", Helvetica, sans-serif;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease;
    }

    .button-primary {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 12px 24px rgba(15, 118, 110, 0.22);
    }

    .button-secondary {
      background: transparent;
      color: var(--text);
      border-color: var(--line);
    }

    .button:hover {
      transform: translateY(-1px);
    }

    .code {
      margin-top: 28px;
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.56);
      overflow-wrap: anywhere;
      font-family: "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.55;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="card">
    <p class="eyebrow">VPN Access</p>
    <h1>Install Happ and open your VPN link.</h1>
    <p class="lead">This page is for browsers. VPN apps receive the raw subscription automatically from the same URL.</p>
    <ol>
      <li>
        Install Happ:
        <a href="https://www.happ.su/main" target="_blank" rel="noreferrer">https://www.happ.su/main</a>
      </li>
      <li>
        Open this link in Happ.
        <div class="actions">
          <a class="button button-primary" href="${escapeHtml(happLink)}">Open In Happ</a>
          <a class="button button-secondary" href="${escapeHtml(subscriptionUrl)}">Open Subscription URL</a>
        </div>
      </li>
    </ol>
    <div class="code">${escapeHtml(happLink)}</div>
  </main>
</body>
</html>`;
}

const subscriptionBody = `${SUBSCRIPTION_ENTRIES.map((entry) =>
    withName(replaceMacros(entry.link), entry.name),
).join("\n")}\n`;

server.get<{ Params: { secret: string } }>("/:secret", async (request, reply) => {
    if (request.params.secret !== VPN_SUBSCRIPTION_SECRET) {
        return reply.code(403).type("text/plain; charset=utf-8").send("❌ Forbidden");
    }

    const userAgent = request.headers["user-agent"] ?? "";

    const isVpnApp = isVpnUserAgent(userAgent);

    if (isVpnApp) {
        return reply
            .header("Cache-Control", "no-store")
            .type("text/plain; charset=utf-8")
            .send(subscriptionBody);
    }

    return reply
        .header("Cache-Control", "no-store")
        .type("text/html; charset=utf-8")
        .send(
            renderInstructionsPage(
                `https://vpn-subscription.senaev.com/${VPN_SUBSCRIPTION_SECRET}`,
            ),
        );
});

async function main(): Promise<void> {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`✅ VPN subscription server listening on port=${PORT}`);
}

async function shutdown(): Promise<void> {
    await server.close();
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
