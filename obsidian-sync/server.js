'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;

if (!process.env.OBSIDIAN_VAULT_PATH) {
  console.error('[obsidian-public-server] ERROR: OBSIDIAN_VAULT_PATH is not set');
  process.exit(1);
}

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH;
const PUBLIC_DIR = path.join(VAULT_PATH, 'public');

const MIME_TYPES = {
  '.md':   'text/markdown; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.pdf':  'application/pdf',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
};

function findFile(dir, filename) {
  if (!fs.existsSync(dir)) return null;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name === filename) {
      return fullPath;
    }
  }

  return null;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const { query } = url.parse(req.url, true);
  const noteParam = query.note;
  const fileParam = query.file;

  if (noteParam !== undefined && fileParam !== undefined) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Use either "note" or "file" parameter, not both');
    return;
  }

  // --- ?note=<name> : find <name>.md, return as text/markdown ---
  if (noteParam !== undefined) {
    if (typeof noteParam !== 'string' || noteParam.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Parameter "note" must not be empty');
      return;
    }

    const safeName = path.basename(noteParam.trim());
    const mdName = safeName.endsWith('.md') ? safeName : `${safeName}.md`;
    const filePath = findFile(PUBLIC_DIR, mdName);

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
    res.end(content);
    return;
  }

  // --- ?file=<name.ext> : find exact filename, return with MIME type by extension ---
  if (fileParam !== undefined) {
    if (typeof fileParam !== 'string' || fileParam.trim() === '') {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Parameter "file" must not be empty');
      return;
    }

    const safeName = path.basename(fileParam.trim());
    const ext = path.extname(safeName).toLowerCase();

    if (!ext) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Parameter "file" must include a file extension');
      return;
    }

    const filePath = findFile(PUBLIC_DIR, safeName);

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let content;
    try {
      content = fs.readFileSync(filePath);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return;
  }

  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.end('Missing required query parameter: "note" or "file"');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[obsidian-public-server] Listening on :${PORT}, serving ${PUBLIC_DIR}`);
});

server.on('error', (err) => {
  console.error('[obsidian-public-server] Fatal:', err.message);
  process.exit(1);
});
