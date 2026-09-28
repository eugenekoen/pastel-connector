import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAccounts, resolveLayout, MASTERS } from './pastelBooks.js';
import { folderSource, has } from './source.js';

const PUBLIC_DIR = fileURLToPath(new URL('../docs/', import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);
const HOST = '127.0.0.1';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.ico': 'image/x-icon',
};

function json(res, status, body)
{
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(payload);
}

async function resolveBooksFolder(booksPath)
{
    if (!booksPath) throw new Error('No set of books folder supplied.');

    const folder = resolve(booksPath);
    const info = await stat(folder).catch(() => null);
    if (!info?.isDirectory()) throw new Error(`Not a folder: ${folder}`);
    return folder;
}

async function handleApi(url, res)
{
    const booksPath = url.searchParams.get('path') ?? process.env.PASTEL_BOOKS ?? '';
    const kind = url.searchParams.get('kind') ?? 'ledger';

    if (url.pathname === '/api/books')
    {
        const folder = await resolveBooksFolder(booksPath);
        const source = await folderSource(folder);
        const names = source.list();

        return json(res, 200, {
            folder,
            dataFiles: names.filter((n) => extname(n).toLowerCase() === '.dat').length,
            dictionary: has(source, 'file.ddf') && has(source, 'field.ddf'),
            masters: Object.entries(MASTERS).map(([key, m]) => ({
                kind: key,
                label: m.label,
                file: m.dataFile,
                present: has(source, m.dataFile),
            })),
        });
    }

    if (url.pathname === '/api/accounts')
    {
        const folder = await resolveBooksFolder(booksPath);
        const result = await readAccounts(await folderSource(folder), kind);
        return json(res, 200, { folder, ...result, count: result.accounts.length });
    }

    if (url.pathname === '/api/layout')
    {
        const folder = await resolveBooksFolder(booksPath);
        return json(res, 200, { folder, layout: await resolveLayout(await folderSource(folder), kind) });
    }

    return json(res, 404, { error: 'Unknown endpoint.' });
}

async function serveStatic(pathname, res)
{
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const full = resolve(PUBLIC_DIR, rel);
    if (!full.startsWith(resolve(PUBLIC_DIR) + sep))
    {
        res.writeHead(403).end('Forbidden');
        return;
    }
    try
    {
        const body = await readFile(full);
        res.writeHead(200, { 'content-type': MIME[extname(full).toLowerCase()] ?? 'application/octet-stream' });
        res.end(body);
    } catch
    {
        res.writeHead(404).end('Not found');
    }
}

const server = createServer(async (req, res) =>
{
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    try
    {
        if (url.pathname.startsWith('/api/')) await handleApi(url, res);
        else await serveStatic(url.pathname, res);
    } catch (err)
    {
        json(res, 400, { error: err.message });
    }
});

server.listen(PORT, HOST, () =>
{
    console.log(`Pastel connector running at http://${HOST}:${PORT}`);
    if (process.env.PASTEL_BOOKS) console.log(`Default books folder: ${process.env.PASTEL_BOOKS}`);
});
