import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, 'app');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
    // Tratamento de URL
    let safeUrl = req.url.split('?')[0];

    // Se a rota vier com prefixo /app (ex: /app/login.html), normaliza
    if (safeUrl.startsWith('/app/')) {
        safeUrl = safeUrl.substring(4);
    } else if (safeUrl === '/app') {
        safeUrl = '/';
    }

    // Rota raiz ou index direciona para login
    if (safeUrl === '/' || safeUrl === '' || safeUrl === '/index.html') {
        safeUrl = '/login.html';
    }

    // Proteção rigorosa contra path traversal
    const safePath = path.normalize(safeUrl).replace(/^(\.\.[\/\\])+/, '');
    const resolvedPath = path.resolve(BASE_DIR, '.' + safePath);
    const resolvedBase = path.resolve(BASE_DIR);

    if (!resolvedPath.startsWith(resolvedBase)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Acesso proibido');
        return;
    }

    fs.stat(resolvedPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Arquivo não encontrado: ' + safeUrl);
            return;
        }

        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        });

        const stream = fs.createReadStream(resolvedPath);
        stream.pipe(res);
    });
});

let port = parseInt(process.env.PORT, 10) || 3030;

function startServer(p) {
    server.listen(p, () => {
        console.log(`\n🚀 Prisma 3D Studio rodando em: http://localhost:${p}`);
        console.log(`📁 Servindo arquivos da pasta: ${BASE_DIR}\n`);
    });
}

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Porta ${port} em uso. Tentando porta ${port + 1}...`);
        port++;
        startServer(port);
    } else {
        console.error('Erro no servidor:', err);
    }
});

startServer(port);
