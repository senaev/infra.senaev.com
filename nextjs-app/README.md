# nextjs-app

The Next.js app of the senaev.com website, including the CV at [senaev.com/cv](https://senaev.com/cv).

## Development

From the repository root, install dependencies with `npm run ci:all` and start the app
with `npm run dev --prefix nextjs-app`. Run `npm run simple-checks` from the repository
root. The infrastructure deployment workflow builds the standalone Next.js image.

## VPN diagnostic response

`GET /api/vpn-test?bytes=16384` returns exactly the requested number of binary bytes
with HTTP 200. `bytes` defaults to 16384 and accepts integers from 1 to 524288
(512 KiB). HEAD returns the same metadata without a body. Invalid, duplicate or
unknown parameters and Range requests return 400. Other methods are unsupported.

The payload is a fixed pseudorandom prefix, independent of website build hashes.
Caching and compression are disabled for this response (`no-store, no-transform`,
`Content-Encoding: identity`). The endpoint does not fetch URLs, read files or
accept delays or unbounded work. The cap limits each response, not aggregate load;
there is no new rate limiter. Keep automated requests infrequent and bounded.

Example manual check (verified TLS, no redirect/retry):

```sh
curl --http1.1 --fail --max-time 8 --max-filesize 524288 \
  --output /tmp/vpn-test.bin --write-out 'status=%{http_code} bytes=%{size_download}\n' \
  'https://senaev.com/api/vpn-test?bytes=65536'
```
