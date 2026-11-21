# senaev-utils

Personal library with utils for `@senaev`.

Published as raw source files without a root entrypoint.

Import utilities directly by path, for example:

```ts
import { deepEqual } from 'senaev-utils/src/utils/Object/deepEqual/deepEqual';
```

### Server HTTP request support

`src/utils/http/registerHttpRequestSupport` registers form parsing, cookies and
route-scoped rate limiting inside a Fastify plugin. `httpRateLimit` supplies
independent route keys with a default budget of 60 requests per minute.
The server helpers require the optional Fastify 5 peer. The cookie, form-body and
rate-limit plugins are runtime dependencies of this library, so production-only
installs can resolve them from the library’s own directory.

Test application responses with a mocked policy and fake clock. Keep the real
request parser, cookie and rate-window contract checks in the utility's separate
integration test; do not mock the HTTP response that an assertion is verifying.
