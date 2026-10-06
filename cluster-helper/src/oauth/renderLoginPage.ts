import type { AuthorizeRequest } from './authorizationServer';

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function hiddenField(name: string, value: string | undefined): string {
    return value === undefined
        ? ''
        : `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

/** The form posts back to /authorize with the original request in hidden fields. */
export function renderLoginPage(request: AuthorizeRequest, error: string | undefined): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · senaev.com</title>
<style>
body { font-family: system-ui, sans-serif; display: flex; justify-content: center; padding-top: 15vh; background: #f4f4f5; }
form { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0, 0, 0, .08); width: 18rem; display: flex; flex-direction: column; gap: .75rem; }
input { font: inherit; padding: .5rem; border: 1px solid #d4d4d8; border-radius: 6px; }
button { font: inherit; padding: .6rem; border: 0; border-radius: 6px; background: #18181b; color: #fff; cursor: pointer; }
.error { color: #b91c1c; margin: 0; }
.client { color: #71717a; font-size: .85rem; margin: 0; word-break: break-all; }
</style>
</head>
<body>
<form method="post" action="/authorize">
<h1 style="margin: 0; font-size: 1.25rem;">Sign in</h1>
<p class="client">${escapeHtml(request.clientId)} asks for access to ${escapeHtml(request.resource)}</p>
${error === undefined ? '' : `<p class="error">${escapeHtml(error)}</p>`}
<input name="username" autocomplete="username" placeholder="Username" required autofocus>
<input name="password" type="password" autocomplete="current-password" placeholder="Password" required>
${hiddenField('response_type', 'code')}
${hiddenField('client_id', request.clientId)}
${hiddenField('redirect_uri', request.redirectUri)}
${hiddenField('state', request.state)}
${hiddenField('code_challenge', request.codeChallenge)}
${hiddenField('code_challenge_method', 'S256')}
${hiddenField('resource', request.resource)}
<button type="submit">Sign in</button>
</form>
</body>
</html>
`;
}
