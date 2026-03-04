import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ExecutionManager } from './executionManager.mjs';
import { NotebookStore } from './notebookStore.mjs';

// Determine Troupe root: either from env or by walking up from this file
const troupeRoot = process.env.TROUPE_ROOT
    || resolve(new URL('..', import.meta.url).pathname, '..');

// Notebook storage directory: --dir arg or .notebook-storage under CWD
const notebookDir = process.argv.includes('--dir')
    ? resolve(process.argv[process.argv.indexOf('--dir') + 1])
    : resolve(process.cwd(), '.notebook-storage');

// Ensure the storage directory exists
mkdirSync(notebookDir, { recursive: true });

const port = parseInt(process.env.PORT || '8888', 10);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const executionManager = new ExecutionManager(troupeRoot);
const notebookStore = new NotebookStore(notebookDir);

// Parse JSON bodies for PUT requests
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files
const publicDir = new URL('../public', import.meta.url).pathname;
app.use(express.static(publicDir));

// ---- REST API ----

// List all .tpnb files
app.get('/api/notebooks', async (_req, res) => {
    try {
        const files = await notebookStore.list();
        res.json({ files });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Load a notebook
app.get('/api/notebook', async (req, res) => {
    const path = req.query.path as string;
    if (!path) {
        return res.status(400).json({ error: 'Missing ?path= parameter' });
    }
    try {
        const data = await notebookStore.load(path);
        res.json(data);
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'Notebook not found' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Save a notebook
app.put('/api/notebook', async (req, res) => {
    const path = req.query.path as string;
    if (!path) {
        return res.status(400).json({ error: 'Missing ?path= parameter' });
    }
    try {
        await notebookStore.save(path, req.body);
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// WebSocket handling
wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (raw: Buffer) => {
        let msg: any;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            ws.send(JSON.stringify({ type: 'stderr', cellId: '', data: 'Invalid JSON message\n' }));
            return;
        }

        if (msg.type === 'execute') {
            const { cellId, source, preamble, options } = msg;
            const fullSource = (preamble || '') + source;

            await executionManager.executeCell(cellId, fullSource, (type, data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type, cellId, data }));
                }
            }, options);
        } else if (msg.type === 'interrupt') {
            executionManager.interrupt(msg.cellId);
        }
    });
});

server.listen(port, () => {
    console.log(`Troupe Notebook server running at http://localhost:${port}`);
    console.log(`Notebook storage: ${notebookDir}`);
});
