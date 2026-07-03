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
  const rawName = query.file;

  if (!rawName || typeof rawName !== 'string' || rawName.trim() === '') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing required query parameter: file');
    return;
  }

  // Strip any path components to prevent directory traversal
  const safeName = path.basename(rawName.trim());
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
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[obsidian-public-server] Listening on :${PORT}, serving ${PUBLIC_DIR}`);
});

server.on('error', (err) => {
  console.error('[obsidian-public-server] Fatal:', err.message);
  process.exit(1);
});
