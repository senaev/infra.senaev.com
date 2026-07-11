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

// Path (relative to the vault root) of the Obsidian Tasks file that receives
// tasks created via POST /tasks. Mirrors TASKS_FILE_PATH from the Obsidian
// plugin's (now removed) tasks-sync feature, which this endpoint replaces.
const TASKS_RELATIVE_PATH = path.join('@senaev', 'tasks', 'tasks_streaming.md');
const TASKS_FILE_PATH = path.join(VAULT_PATH, TASKS_RELATIVE_PATH);

const MAX_TASK_BODY_BYTES = 1024 * 1024; // 1 MB

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

// --- Task creation helpers (POST /tasks) ---

/** Reads and JSON-parses the request body, rejecting oversized or malformed payloads. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;

    req.on('data', (chunk) => {
      if (tooLarge) {
        return;
      }
      raw += chunk;
      if (raw.length > MAX_TASK_BODY_BYTES) {
        // Stop accumulating to bound memory, but keep draining the stream
        // (rather than destroying the socket) so the response we write once
        // 'end' fires actually reaches the client instead of being dropped.
        tooLarge = true;
        raw = '';
      }
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(new Error('Request body too large'));
        return;
      }
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Format a task as an Obsidian Tasks plugin-compatible checkbox line.
 *
 * Examples:
 *   - [ ] Buy groceries
 *   - [ ] Submit report 📅 2026-07-15
 */
function formatTaskLine(title, dueDate) {
  const due = dueDate ? ` 📅 ${dueDate}` : '';
  return `- [ ] ${title}${due}`;
}

/**
 * Prepend `line` at the very beginning of `content`, separated by a blank
 * line from the existing content.
 */
function prependToContent(content, line) {
  const trimmed = content.trimStart();
  if (!trimmed) {
    return `${line}\n`;
  }
  return `${line}\n\n${trimmed}`;
}

/** Prepends `line` to the tasks file, creating the file (and folders) if needed. */
async function prependTaskLine(line) {
  await fs.promises.mkdir(path.dirname(TASKS_FILE_PATH), { recursive: true });

  let content = '';
  try {
    content = await fs.promises.readFile(TASKS_FILE_PATH, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  await fs.promises.writeFile(TASKS_FILE_PATH, prependToContent(content, line), 'utf8');
}

async function handleCreateTask(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(err.message);
    return;
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Request body must be a JSON object');
    return;
  }

  const { title, due_date: dueDate } = body;

  if (typeof title !== 'string' || title.trim() === '') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Field "title" is required and must be a non-empty string');
    return;
  }

  if (dueDate !== undefined && dueDate !== null && typeof dueDate !== 'string') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Field "due_date" must be a string or null');
    return;
  }

  const normalizedDueDate =
    typeof dueDate === 'string' && dueDate.trim() !== '' ? dueDate.trim() : null;
  const line = formatTaskLine(title.trim(), normalizedDueDate);

  try {
    await prependTaskLine(line);
  } catch (err) {
    console.error('[obsidian-public-server] Failed to write task to vault:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
    return;
  }

  console.log(`[obsidian-public-server] Task added: ${JSON.stringify(line)}`);
  res.writeHead(201, { 'Content-Type': 'text/plain' });
  res.end('Created');
}

const server = http.createServer((req, res) => {
  const { pathname, query } = url.parse(req.url, true);

  if (req.method === 'POST' && pathname === '/tasks') {
    void handleCreateTask(req, res);
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

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
