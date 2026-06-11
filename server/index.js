// Server de producción: envuelve el handler de adapter-node con compresión gzip/brotli.
// adapter-node no comprime respuestas dinámicas (HTML/JSON), solo los assets
// precomprimidos en build (precompress: true en svelte.config.js).
import http from 'node:http';
import compression from '@polka/compression';
import { handler } from '../build/handler.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const compress = compression({ threshold: 1024 });

const server = http.createServer((req, res) => {
	compress(req, res, () => handler(req, res));
});

server.listen(port, host, () => {
	console.log(`menuplan escuchando en http://${host}:${port}`);
});
