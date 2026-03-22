function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function renderInstructionsPage({
    subscriptionUrl,
    title,
    announcements,
    telegramChatUrl,
}: {
    subscriptionUrl: string;
    title: string;
    announcements: string[];
    telegramChatUrl: string;
}): string {
    const happLink = `happ://add/${subscriptionUrl}`;
    const escapedHappLink = escapeHtml(happLink);
    const escapedTitle = escapeHtml(title);
    const escapedTelegramChatUrl = escapeHtml(telegramChatUrl);
    const renderedAnnouncements = announcements
        .map((announcement) => `<li>${escapeHtml(announcement)}</li>`)
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
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
      gap: 10px;
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
      background: #229ed9;
      color: #fff;
      box-shadow: 0 12px 24px rgba(34, 158, 217, 0.22);
    }

    .button:hover {
      transform: translateY(-1px);
    }

    .button-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      fill: currentColor;
    }

    .extra {
      margin-top: 22px;
      padding-top: 22px;
      border-top: 1px solid var(--line);
    }

    .extra ul {
      margin: 0 0 18px;
      padding-left: 22px;
    }

    .extra li {
      margin: 0 0 10px;
      padding-left: 0;
      font-size: 17px;
      line-height: 1.5;
    }

  </style>
</head>
<body>
  <main class="card">
    <h1>${escapedTitle}</h1>
    <ol>
      <li>
        Install:
        <a href="https://www.happ.su/main" target="_blank" rel="noreferrer">https://www.happ.su/main</a>
      </li>
      <li>
        Click:
        <div class="actions">
          <a class="button button-primary" href="${escapedHappLink}">
            <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5.2 4.6h4.1l-.62 5.03h6.55l.62-5.03h4.1L18.03 19.4h-4.1l.72-5.87H8.1l-.72 5.87h-4.1L5.2 4.6Z" fill="#fff"></path>
            </svg>
            Open In Happ
          </a>
          <a class="button button-secondary" href="${escapedTelegramChatUrl}" target="_blank" rel="noreferrer">
            <svg class="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.37 4.51 18.2 19.47c-.24 1.06-.86 1.33-1.74.83l-4.82-3.55-2.32 2.23c-.26.26-.47.47-.98.47l.35-4.95 9.01-8.14c.39-.35-.08-.55-.61-.2L6.04 13.12 1.28 11.63c-1.04-.32-1.05-1.04.22-1.54L20.1 2.93c.87-.32 1.63.2 1.27 1.58Z"></path>
            </svg>
            Telegram Chat
          </a>
        </div>
      </li>
    </ol>
    <section class="extra">
      <ul>${renderedAnnouncements}</ul>
    </section>
  </main>
</body>
</html>`;
}
