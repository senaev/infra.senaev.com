# obsidian-sync

Kubernetes sidecar that keeps an Obsidian vault in continuous bidirectional sync via `obsidian-headless`, and exposes a read-only HTTP server to serve files from the vault's `public/` folder to other in-cluster services.

## Container processes

Two processes run inside the pod. If either exits, the container exits and Kubernetes restarts the pod.

| Process | Role |
|---------|------|
| `ob sync --continuous` | Bidirectional sync with Obsidian cloud |
| `node /server.js` | HTTP file server on `:8080` |

## HTTP server

### Access

The server is exposed as a `ClusterIP` Service — reachable only from within the cluster.

| Caller location | Base URL |
|-----------------|----------|
| Same namespace (`senaev-com`) | `http://obsidian-sync:8080` |
| Any other namespace | `http://obsidian-sync.senaev-com.svc.cluster.local:8080` |

### Endpoints

Both parameters search **recursively** inside the `public/` folder of the vault. The search is **case-sensitive**.

---

#### `GET /?note=<name>`

Returns a Markdown note. The `.md` extension is appended automatically — do not include it in the parameter.

```
GET /?note=welcome
→ searches public/ for welcome.md
→ 200 text/markdown; charset=utf-8
```

```bash
curl http://obsidian-sync:8080/?note=welcome
curl http://obsidian-sync:8080/?note=subfolder-name-is-irrelevant
```

---

#### `GET /?file=<name.ext>`

Returns an arbitrary file. The full filename including extension is required. The `Content-Type` header is resolved from the extension (see table below).

```
GET /?file=diagram.png
→ searches public/ for diagram.png
→ 200 image/png
```

```bash
curl http://obsidian-sync:8080/?file=diagram.png
curl http://obsidian-sync:8080/?file=report.pdf
curl http://obsidian-sync:8080/?file=data.json
```

**Known MIME types:**

| Extension | Content-Type |
|-----------|-------------|
| `.md` | `text/markdown; charset=utf-8` |
| `.txt` | `text/plain; charset=utf-8` |
| `.html` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js` | `application/javascript; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.xml` | `application/xml; charset=utf-8` |
| `.pdf` | `application/pdf` |
| `.png` | `image/png` |
| `.jpg` / `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.ico` | `image/x-icon` |
| `.mp4` | `video/mp4` |
| `.webm` | `video/webm` |
| `.mp3` | `audio/mpeg` |
| `.ogg` | `audio/ogg` |
| `.wav` | `audio/wav` |

Any extension not listed above is served as `application/octet-stream`.

---

### Response codes

| Status | Meaning |
|--------|---------|
| `200 OK` | File found; body is the file content |
| `400 Bad Request` | Parameter missing or empty; both parameters provided at once; `?file=` value has no extension |
| `404 Not Found` | No file with that name exists under `public/` |
| `405 Method Not Allowed` | Non-GET request |
| `500 Internal Server Error` | File exists but could not be read |

### Security

- `path.basename()` is applied to all inputs — passing `../../etc/passwd` or any path separators is safe and will return 404.
- The `public/` folder must exist inside the vault root for any request to succeed.
- The Service type is `ClusterIP`: the port is physically unreachable from outside the cluster.

## Environment variables

| Variable | Source | Description |
|----------|--------|-------------|
| `OBSIDIAN_AUTH_TOKEN` | Vault → `senaev-com-kv-secrets` | Obsidian Sync auth token |
| `OBSIDIAN_VAULT_NAME` | Vault → `senaev-com-kv-secrets` | Name of the vault in Obsidian cloud |
| `OBSIDIAN_VAULT_PATH` | Helm `obsidianSync.containerVaultPath` | Mount path of the vault volume inside the container |
