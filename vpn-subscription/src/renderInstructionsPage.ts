function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function renderInstructionsPage(subscriptionUrl: string): string {
    const happLink = `happ://add/${subscriptionUrl}`;
    const escapedHappLink = escapeHtml(happLink);

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

    h1 {
      margin: 0 0 12px;
      font-size: clamp(38px, 7vw, 64px);
      line-height: 0.96;
      letter-spacing: -0.04em;
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
      cursor: pointer;
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

    .hint {
      margin-top: 12px;
      min-height: 20px;
      font-family: "Helvetica Neue", Helvetica, sans-serif;
      font-size: 14px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="card">
    <h1><a href="https://senaev.com" target="_blank">Senaev</a> VPN</h1>
    <ol>
      <li>
        Install Happ:
        <a href="https://www.happ.su/main" target="_blank" rel="noreferrer">https://www.happ.su/main</a>
      </li>
      <li>
        Open this link in Happ.
        <div class="actions">
          <a class="button button-primary" href="${escapedHappLink}">Open In Happ</a>
          <button class="button button-secondary" id="copy-subscription-button" type="button">Copy URL</button>
        </div>
      </li>
    </ol>
    <div class="hint" id="copy-subscription-status"></div>
    <div class="code">${escapedHappLink}</div>
  </main>
  <script>
    const subscriptionUrl = ${JSON.stringify(subscriptionUrl)};
    const copyButton = document.getElementById("copy-subscription-button");
    const copyStatus = document.getElementById("copy-subscription-status");

    async function copySubscriptionUrl() {
      try {
        await navigator.clipboard.writeText(subscriptionUrl);
        if (copyStatus) {
          copyStatus.textContent = "Subscription URL copied.";
        }
      } catch {
        if (copyStatus) {
          copyStatus.textContent = "Copy failed. Copy it manually from the page URL.";
        }
      }
    }

    if (copyButton) {
      copyButton.addEventListener("click", () => {
        void copySubscriptionUrl();
      });
    }
  </script>
</body>
</html>`;
}
