const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// POST /rpc?target=<RPC_URL>
// Example: POST http://localhost:3000/rpc?target=https://api.mainnet-beta.solana.com
app.post('/rpc', async (req, res) => {
    const target = req.query.target || process.env.TARGET_RPC;
    if (!target) return res.status(400).json({ error: 'Missing target RPC. Provide ?target=<rpc_url> or set TARGET_RPC env.' });

    try {
        const response = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            // optional: timeout handling can be added
        });

        const text = await response.text();
        // Mirror status and content-type
        res.status(response.status).set('Content-Type', response.headers.get('content-type') || 'application/json').send(text);
    } catch (err) {
        console.error('Proxy error:', err);
        res.status(502).json({ error: String(err) });
    }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`RPC proxy listening on http://localhost:${port}`));
