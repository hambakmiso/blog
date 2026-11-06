'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const DIST_DIR = path.join(__dirname, 'dist');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendText(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function resolveFile(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (pathname.includes('\0')) return null;

  const file = path.join(DIST_DIR, pathname);
  // %2e%2e%5c처럼 디코딩 후에 나타나는 상위 경로도 여기서 막힌다.
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) return null;
  return file;
}

function sendFile(req, res, file, isRetry = false) {
  fs.readFile(file, (error, data) => {
    if (error && error.code === 'EISDIR' && !isRetry) {
      sendFile(req, res, path.join(file, 'index.html'), true);
      return;
    }
    if (error) {
      sendText(res, 404, '찾을 수 없습니다.');
      return;
    }
    const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, '허용되지 않는 요청입니다.');
    return;
  }

  let file;
  try {
    file = resolveFile(req.url);
  } catch {
    sendText(res, 400, '잘못된 요청입니다.');
    return;
  }
  if (!file) {
    sendText(res, 403, '접근할 수 없습니다.');
    return;
  }
  sendFile(req, res, file);
});

server.on('error', (error) => {
  const message = error.code === 'EADDRINUSE' ? `포트 ${PORT}을(를) 이미 사용 중입니다.` : error.message;
  console.error(`서버 시작 실패: ${message}`);
  process.exitCode = 1;
});

if (!fs.existsSync(DIST_DIR)) {
  console.error('dist/가 없습니다. 먼저 node build.js를 실행하세요.');
  process.exitCode = 1;
} else {
  server.listen(PORT, HOST, () => {
    console.log(`미리보기: http://localhost:${PORT}`);
  });
}
