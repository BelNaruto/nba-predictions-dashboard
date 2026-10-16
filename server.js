#!/usr/bin/env node
/**
 * NBA Predictions Dashboard – zero-dependency server
 *
 * Serves the web app and proxies a few Basketball API endpoints so your
 * RapidAPI key never reaches the browser.
 *
 * API:     https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/api-basketball-nba
 * Support: Telegram @pintoflow
 *
 *   RAPIDAPI_KEY=your_key node server.js   -> live data
 *   node server.js                         -> demo mode (sample data)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3001;
const KEY = process.env.RAPIDAPI_KEY || '';
const HOST = 'api-basketball-nba.p.rapidapi.com';
const DEMO = !KEY || process.env.DEMO === '1';
const PUBLIC = path.join(__dirname, 'public');

// Only these routes are forwarded. [regex, allowed query params, demo file]
const ROUTES = [
  [/^\/v2\/predictions$/, ['date', 'league'], 'predictions.json'],
  [/^\/v2\/predictions\/season$/, ['sims', 'season', 'league'], 'season.json'],
  [/^\/v2\/predictions\/accuracy$/, ['league'], 'accuracy.json'],
  [/^\/v2\/power-rankings$/, ['season', 'league'], 'power.json'],
];
const cache = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/api/config') return send(res, 200, JSON.stringify({ demo: DEMO }));
      if (u.pathname.startsWith('/api/')) {
        const route = u.pathname.slice(4);
        const rule = ROUTES.find(([re]) => re.test(route));
        if (!rule) return send(res, 404, JSON.stringify({ error: { status: 404, message: 'Unknown route' } }));
        if (DEMO) return send(res, 200, fs.readFileSync(path.join(__dirname, 'demo', rule[2])));
        const url = new URL(`https://${HOST}${route}`);
        rule[1].forEach((p) => u.searchParams.has(p) && url.searchParams.set(p, u.searchParams.get(p)));
        const ck = url.toString();
        const hit = cache.get(ck);
        if (hit && Date.now() < hit.exp) return send(res, 200, hit.body);
        const r = await fetch(url, { headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': KEY } });
        const body = await r.text();
        if (r.ok) {
          // Respect the API's own freshness hint (meta.cacheTtlSeconds)
          let ttl = 60;
          try { ttl = JSON.parse(body).meta?.cacheTtlSeconds ?? 60; } catch {}
          cache.set(ck, { body, exp: Date.now() + ttl * 1000 });
        }
        return send(res, r.status, body);
      }
      const file = path.join(PUBLIC, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      send(res, 502, JSON.stringify({ error: { status: 502, message: e.message } }));
    }
  })
  .listen(PORT, () => console.log(`NBA Predictions Dashboard on http://localhost:${PORT}${DEMO ? '  (DEMO mode – sample data, set RAPIDAPI_KEY for live data)' : ''}`));
