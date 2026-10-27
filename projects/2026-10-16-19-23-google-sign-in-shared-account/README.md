# 2026-10-16 — Google sign-in for the shared account

- [x] Add allowlisted Google sign-in next to password login for the existing shared account

## Goal

Add a "Sign in with Google" option (Google OpenID Connect) to the OAuth authorization
server in Cluster Helper. Password login stays. Both methods authorize the same shared
account and give the same full MCP access.

Out of scope: separate users, user profiles, roles, per-user permissions and a user
database. Each allowed Google account is only an alternative way into the same account.

## Context

Baseline, checked against the source on 2026-10-16:

- [`cluster-helper/src/oauth/authorizationServer.ts`](../../cluster-helper/src/oauth/authorizationServer.ts)
  issues HS256 JWTs: access tokens for 1 hour, refresh tokens for 90 days. The server
  stores no tokens; ChatGPT keeps them.
- The signing key is `HMAC-SHA256(AUTH_TOKEN_SIGNING_SECRET, AUTH_MY_PASSWORD)`. A change
  of the password or the secret revokes all tokens. There is no other revocation.
- Only one-time authorization codes are in memory (`issuedCodes`, 60 s). A restart stops
  an unfinished login; issued tokens survive a restart.
- Refresh issues a new pair and does not invalidate the old refresh token.
- The password form is stateless: the ChatGPT request comes back in hidden fields, and
  `parseAuthorizeRequest` checks it again on each POST.
- [`registerOAuthRoutes.ts`](../../cluster-helper/src/oauth/registerOAuthRoutes.ts): routes
  are bound to `auth.senaev.com`. The login page CSP has
  `form-action 'self' https://chatgpt.com`. `POST /authorize` has a rate limit of
  10 per 15 minutes with one shared key.
- [`renderLoginPage.ts`](../../cluster-helper/src/oauth/renderLoginPage.ts): the success page
  says "Your username and password were accepted".
- Config: Vault → External Secrets (`refreshInterval: 30s`) → Secret
  `senaev-com-kv-secrets` → env vars. The Deployment has the Reloader annotation
  `secret.reloader.stakater.com/reload`, so a change of the Secret restarts the pod.
  See [`cluster-helper.yaml`](../../provisioning/helm/senaev-com/templates/cluster-helper.yaml)
  and [`external-secret.yaml`](../../provisioning/helm/senaev-com/templates/external-secret.yaml).
- Dependencies: `fastify`, `@fastify/formbody`, `@fastify/rate-limit`, `jose`.

## Plan

### Flow

1. ChatGPT starts the existing authorization-code flow with PKCE at `/authorize`.
2. The login page shows the password form and a "Sign in with Google" button.
3. The Google button is a separate `GET` form to `/google/start` with the ChatGPT request
   in hidden fields.
4. 📌 `/google/start` checks the ChatGPT request again with `parseAuthorizeRequest`, and
   continues only on `show-login`; add a test that a changed `redirect_uri` is rejected. The
   browser can change hidden fields, so the server must not trust them. Without this
   check, an attacker could send the owner a link with the attacker's `redirect_uri`;
   after a Google login, the authorization code would go to the attacker.
5. `/google/start` creates the login transaction (see below) and redirects to Google.
6. Google redirects back to `https://auth.senaev.com/google/callback`.
7. The callback validates the Google response and checks the verified email against the
   allowlist.
8. On success, the server completes the original ChatGPT request with the existing
   one-time code and PKCE exchange, and shows the success page.
9. The server issues its own access and refresh tokens. Google tokens are never used as
   MCP bearer tokens.

### Login transaction in an encrypted cookie

Keep the transaction in the browser, not in server memory:

- `/google/start` puts the checked ChatGPT request, the Google `state`, `nonce` and PKCE
  `code_verifier` into an encrypted, short-lived cookie (10 minutes).
- The cookie is `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. Its name
  contains the `state`, so two logins in two tabs do not overwrite each other.
- The callback reads the cookie whose name matches the `state` in the query, decrypts
  it, and deletes it.
- Replay: the cookie is deleted after use, and Google accepts each authorization code
  only once.

Why: the server keeps no transaction map, so nobody can fill memory through the public
start route. The browser cannot read or change the content. A restart does not stop an
unfinished Google login.

📌 Libraries:
- `jose` `EncryptJWT` (`dir` + `A256GCM`, with `exp`) for the cookie content; the key is
  derived from `AUTH_TOKEN_SIGNING_SECRET`. Already a dependency; no hand-written AES-GCM.
- `@fastify/cookie` to read and set the cookies.
- Not `@fastify/secure-session`: it needs libsodium (a native addon), and its single
  session cookie does not fit one cookie per `state`.

### Google OIDC

- Use `openid-client` (v6, by the author of `jose`) for the Google leg: discovery,
  `state`, `nonce` and PKCE generation, the code exchange, and ID token validation
  (signature, `iss`, `aud`, `exp`, `nonce`).
- Use PKCE also in the Google leg, and the default `response_mode=query`. With
  `form_post`, the `SameSite=Lax` cookie is not sent to the callback.
- Request only `openid email`. No Google API access and no Google refresh token.
- Require `email_verified === true` and an exact match with the allowlist.
- Inject `fetch` and the key set, so tests run without the network.
- Do not store Google tokens. Do not log credentials, codes, ID tokens or service tokens.

### Login page and CSP

- 📌 Add `https://accounts.google.com` to `form-action` in `LOGIN_PAGE_CSP`. The browser
  applies `form-action` to the redirect after the Google form submit.
- Do not use Google's JS sign-in library: it needs `script-src` and frames. A styled form
  button is enough.
- 📌 Make the success page text general, for example "Sign-in was successful. Return to
  the app to finish connecting."

### Rate limits

The existing limit covers only `POST /authorize`, with one key for everybody. The Google
routes need their own key, not `'login'`: with a shared key, a stranger who guesses
passwords also locks Google login.

With the cookie design, a strict limit on the Google routes protects nothing: start only
sets a cookie and redirects, and the callback calls Google only with a valid cookie, which
needs a real Google login. A strict limit would only let a stranger lock Google login.

📌 Change the `POST /authorize` limit from 10 per 15 minutes to 60 per minute. Use the
same limit, 60 per minute, for each Google route, each with its own key.

### Configuration

Proposed names:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_ADMIN_EMAILS`: raw emails, comma-separated; trim and lowercase each entry; reject
  empty or invalid entries at start. No Gmail dot or `+` rules.

Wire them through Vault, External Secrets and Helm. A change in Vault reaches the pod
in about 30 s, and Reloader then restarts it.

📌 All three variables are required: read them with `requireEnv` in `env.ts`. Put the
values in Vault before the deploy, or the pod does not start.

📌 The allowlist lives in Vault as one comma-separated string in
`GOOGLE_OAUTH_ADMIN_EMAILS` (the repository is public, so no emails in Helm values).
The tokens still carry only the email hash, not the plain email.

📌 Only Gmail accounts. At start, reject an allowlist entry that does not end with
`@gmail.com`. At the callback, reject a Google email that does not end with `@gmail.com`,
before the allowlist check.

### Tokens and allowlist removal

Removing an email must block a new Google login and the renewal of tokens issued through
that email.

- Same subject and scope for all tokens. Add only signed provenance to Google-origin
  tokens: `idp: "google"` and a hash of the email (not the plain email: ChatGPT can read
  the JWT payload).
- Refresh copies the provenance into the new pair.
- Tokens without `idp` are password or pre-change tokens and keep their current behaviour.

📌 Check the allowlist only at refresh, not in `checkAccessToken`. An access token issued
before the removal stays valid until it expires (up to one hour). Document this limit.

### Google Cloud setup (owner)

- Create an OAuth client of type Web application, with the redirect URI
  `https://auth.senaev.com/google/callback`.
- Keep the app in "Testing" mode: no verification is needed, and the test-user list acts
  as a second allowlist at Google. The 7-day limit of Testing mode applies only to Google
  refresh tokens, which we do not use. Google sign-in is free.
- Record the steps and the required values in this file, without secrets.

### Other

📌 Send a Telegram message to `TG_CLUSTER_CHAT_ID` for each login attempt, successful or denied, for both
methods. The message contains the auth type (`password` or `google`), the result, and
the account: the Google email, or the given username for password login. Never include
passwords, codes or tokens.

### Steps

1. Recheck the source; add `openid-client` and `@fastify/cookie`.
2. Refactor `authorizationServer.ts`: share the completion of a checked request between
   password and Google login.
3. Add the Google module, the `/google/start` and `/google/callback` routes, the button,
   the CSP change and the general success text.
4. Add token provenance and the allowlist check.
5. Add the config to `env.ts`, Helm and External Secrets.
6. Add focused tests; run `npm run simple-checks`; open a PR.
7. After deployment, check both login methods end-to-end.

## Verification

- Password login and Google login both connect ChatGPT and give the same MCP access.
- An allowed, verified Google account signs in; a non-allowed account gets a clear error.
- Cancelled consent, a missing or wrong `state`, an expired cookie and a replayed callback
  give a clear error and do not issue a code.
- Two logins in two tabs both complete.
- After an email is removed and the pod restarts, its refresh token is rejected.
- Password and pre-change tokens keep working.
- Issued tokens survive a restart with unchanged config.
- Login from the ChatGPT mobile app: Google blocks OAuth in embedded webviews
  (`disallowed_useragent`). If the app opens the login in a webview, only password login
  works there; record the result.

## Findings

### 2026-10-16 — Task created

Moved from the Obsidian vault and rewritten after review. Decisions: add
`https://accounts.google.com` to `form-action`; make the success text general; keep the
login transaction in an encrypted per-`state` cookie instead of server memory. The
allowlist reaches the pod through External Secrets and Reloader, so no extra restart step
is needed.

References:
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/openid-connect/reference

### 2026-10-16 — Google Cloud client and Vault values created (owner)

Done by the owner in the Google Cloud console:
- New project with no organization; Google Auth Platform with audience **External**,
  publishing status **Testing**.
- Authorized domain `senaev.com`; no logo (a logo starts brand verification).
- Test users: the same Gmail addresses as in `GOOGLE_OAUTH_ADMIN_EMAILS`.
- Scopes: `openid` and `.../auth/userinfo.email` only.
- OAuth client of type Web application, name `cluster-helper`, no JavaScript origins,
  redirect URI `https://auth.senaev.com/google/callback`.
- The client secret is shown only once at creation; if lost, add a new secret to the client.

Vault values added with `vault kv patch kv/senaev-com-kv` (never `put`, which replaces all
keys): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_ADMIN_EMAILS`.
To add or remove an allowed account, change both `GOOGLE_OAUTH_ADMIN_EMAILS` in Vault and
the test-user list in Google.

Next: implementation, see Steps.

### 2026-10-17 — Implementation

Done directly on `main`, without a PR (owner's decision).

- New dependencies: `openid-client@6.8.8`, `@fastify/cookie@11.1.3`.
- [`googleLogin.ts`](../../cluster-helper/src/oauth/googleLogin.ts): Google OIDC with PKCE,
  state and nonce; static Google metadata, so startup does not depend on discovery; ID
  token signature checked with Google's keys (`enableNonRepudiationChecks`). The
  transaction is a `jose` `EncryptJWT` (`dir` + `A256GCM`, 10 minutes) in the cookie
  `__Host-google-login-<state>`. `parseGoogleAdminEmails` rejects any entry that is not a
  Gmail address, so a bad value stops the pod at start.
- [`authorizationServer.ts`](../../cluster-helper/src/oauth/authorizationServer.ts):
  `completeAuthorization` is shared by both methods. Google-origin tokens carry
  `idp: "google"` and `email_hash` (HMAC with the signing key); refresh copies them and
  rejects an email that is no longer allowed. Tokens without `idp` behave as before.
  `onLoginAttempt` reports every password attempt.
- [`registerOAuthRoutes.ts`](../../cluster-helper/src/oauth/registerOAuthRoutes.ts):
  `GET /google/start` (checks the request again with `authorize`), `GET /google/callback`
  (deletes the cookie whatever the result). CSP `form-action` includes
  `https://accounts.google.com`. Rate limits: 60 per minute with separate keys `login`,
  `google-start`, `google-callback`. Denied or cancelled Google login shows the login form
  again with an error.
- [`renderLoginPage.ts`](../../cluster-helper/src/oauth/renderLoginPage.ts): "Sign in with
  Google" form button; general success text.
- [`index.ts`](../../cluster-helper/src/index.ts): Telegram message to `TG_CLUSTER_CHAT_ID`
  for each attempt (method, result, account); never a password, code or token.
- Helm: three `GOOGLE_OAUTH_*` keys in `external-secret.yaml` and `cluster-helper.yaml`.
- Tests: fake Google token endpoint and keys in
  [`testing/fakeGoogle.ts`](../../cluster-helper/src/oauth/testing/fakeGoogle.ts); 41 OAuth
  tests. `npm run simple-checks` passes.

Deploy order: the image build and the Helm deploy run in parallel. If the new image starts
before the Helm change adds the variables, its pod fails at start and the old pod keeps
running (RollingUpdate); the Helm deploy then replaces it.

Next: after the deploy, run the checks in Verification.

### 2026-10-17 — Google logo and production check

The Google button shows the inline four-colour Google "G" SVG instead of text (`1cc1a35`);
`aria-label` and `title` keep "Sign in with Google". Inline SVG needs no CSP change.

Checked by the owner in production through ChatGPT: password login, Google login with an
allowed account, and a denied Google account ("This Google account is not allowed.") all
work.

## Result

Google sign-in works next to password login for the same shared account (`ceb0266`,
`1cc1a35`). Only verified Gmail addresses in `GOOGLE_OAUTH_ADMIN_EMAILS` can sign in; the
Google login transaction lives in an encrypted per-`state` cookie; Google-origin tokens
carry a hashed email, and refresh stops after the email is removed. Every login attempt
goes to Telegram.

Open points, not checked:
- Login from the ChatGPT mobile app (Google can block OAuth in an embedded webview).
- Two parallel logins in two tabs, and the refresh rejection after an email is removed
  (both covered by tests only).
