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

// Inline, so the CSP needs no `img-src`. The standard four-colour Google "G".
const GOOGLE_LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
</svg>`;

function requestFields(request: AuthorizeRequest): string {
    return [
        hiddenField('response_type', 'code'),
        hiddenField('client_id', request.clientId),
        hiddenField('redirect_uri', request.redirectUri),
        hiddenField('state', request.state),
        hiddenField('code_challenge', request.codeChallenge),
        hiddenField('code_challenge_method', 'S256'),
        hiddenField('resource', request.resource),
    ].join('\n');
}

/**
 * Both forms carry the original request in hidden fields: the password form posts back to
 * /authorize, the Google form starts the Google flow. The server checks the request again
 * in both cases.
 */
export function renderLoginPage(request: AuthorizeRequest, error: string | undefined): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · senaev.com</title>
<style>
body { font-family: system-ui, sans-serif; display: flex; justify-content: center; padding-top: 15vh; background: #f4f4f5; }
main { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0, 0, 0, .08); width: 18rem; display: flex; flex-direction: column; gap: .75rem; }
form { display: flex; flex-direction: column; gap: .75rem; margin: 0; }
input { font: inherit; padding: .5rem; border: 1px solid #d4d4d8; border-radius: 6px; }
button { font: inherit; padding: .6rem; border: 0; border-radius: 6px; background: #18181b; color: #fff; cursor: pointer; width: 100%; }
.google { background: #fff; color: #1f1f1f; border: 1px solid #747775; display: flex; justify-content: center; align-items: center; gap: .75rem; font-weight: 500; }
.google:hover { background: #f4f4f5; }
.google svg { width: 1.25rem; height: 1.25rem; display: block; flex: none; }
.separator { color: #71717a; font-size: .85rem; text-align: center; margin: 0; }
.error { color: #b91c1c; margin: 0; }
.client { color: #71717a; font-size: .85rem; margin: 0; word-break: break-all; }
</style>
</head>
<body>
<main>
<h1 style="margin: 0; font-size: 1.25rem;">Sign in</h1>
<p class="client">${escapeHtml(request.clientId)} asks for access to ${escapeHtml(request.resource)}</p>
${error === undefined ? '' : `<p class="error" role="alert">${escapeHtml(error)}</p>`}
<form method="post" action="/authorize">
<input name="username" autocomplete="username" placeholder="Username" required autofocus>
<input name="password" type="password" autocomplete="current-password" placeholder="Password" required>
${requestFields(request)}
<button type="submit">Sign in</button>
</form>
<p class="separator">or</p>
<form method="get" action="/google/start">
${requestFields(request)}
<button type="submit" class="google">${GOOGLE_LOGO}<span>Sign in with Google</span></button>
</form>
</main>
</body>
</html>
`;
}

/** No credentials or request parameters are reflected on this standalone error page. */
export function renderAuthorizationError(message: string, requestId: string, continueUrl?: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign-in failed · senaev.com</title>
<style>
body { font-family: system-ui, sans-serif; background: #f4f4f5; padding: 10vh 1rem; }
main { background: white; max-width: 28rem; margin: auto; padding: 2rem; border-radius: 12px; }
.error { color: #b91c1c; } p { overflow-wrap: anywhere; }
</style>
</head>
<body><main>
<h1>Sign-in failed</h1>
<p class="error" role="alert">${escapeHtml(message)}</p>
<p>Return to the app and start the connection again. If this keeps happening, share the reference below with the server owner.</p>
<p>Reference: ${escapeHtml(requestId)}</p>
${continueUrl === undefined ? '' : `<p><a href="${escapeHtml(continueUrl)}">Return to the app with this error</a></p>`}
</main></body>
</html>`;
}

/** A user-initiated link avoids the browser's form redirect chain restrictions. */
export function renderAuthorizationSuccess(continueUrl: string, nonce: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signed in · senaev.com</title>
<style>
body { font-family: system-ui, sans-serif; background: #f4f4f5; margin: 0; padding: 10vh 1rem; }
main { box-sizing: border-box; background: white; max-width: 28rem; margin: auto; padding: 2rem; border-radius: 12px; }
a { display: block; padding: .8rem; border-radius: 6px; background: #18181b; color: white; text-align: center; text-decoration: none; }
</style>
</head>
<body><main>
<h1>Signed in successfully</h1>
<p>Sign-in was successful. Return to the app to finish connecting.</p>
<a href="${escapeHtml(continueUrl)}" rel="noreferrer">Return to the app</a>
<p>This link expires shortly. If it has expired, start the connection again from the app.</p>
</main>
<script nonce="${escapeHtml(nonce)}">
// Keep the link visible if scripting or automatic navigation is blocked.
window.setTimeout(function () {
    var link = document.querySelector('main a');
    if (link) {
        try { window.location.assign(link.href); } catch (_) { /* The link remains available. */ }
    }
}, 500);
</script>
</body>
</html>`;
}
