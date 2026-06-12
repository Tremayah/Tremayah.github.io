#!/usr/bin/env node
/**
 * MCP server: list font families available in Adobe Fonts kit var1bvf.
 * Register with: claude mcp add fonts -- node /path/to/scripts/list-adobe-kit-fonts.js
 */

const KIT_URL = 'https://use.typekit.net/var1bvf.css';

async function listFonts() {
  const res = await fetch(KIT_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching kit CSS`);
  const css = await res.text();
  const families = new Set();
  for (const match of css.matchAll(/font-family:"([^"]+)"/g)) {
    families.add(match[1]);
  }
  if (families.size === 0) throw new Error('No font families found — kit CSS format may have changed');
  return [...families].sort();
}

// Minimal MCP stdio server (JSON-RPC 2.0 over newline-delimited stdout/stdin)
process.stdin.setEncoding('utf8');
let buf = '';

process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) {
      try { handle(JSON.parse(line)); } catch { /* ignore parse errors */ }
    }
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handle({ id, method, params }) {
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fonts', version: '1.0.0' },
      },
    });
  } else if (method === 'initialized') {
    // notification — no response
  } else if (method === 'tools/list') {
    send({
      jsonrpc: '2.0', id,
      result: {
        tools: [{
          name: 'list_kit_fonts',
          description: 'List all CSS font-family names available in Adobe Fonts kit var1bvf (tremayah.com)',
          inputSchema: { type: 'object', properties: {} },
        }],
      },
    });
  } else if (method === 'tools/call' && params?.name === 'list_kit_fonts') {
    try {
      const fonts = await listFonts();
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: fonts.join('\n') }] },
      });
    } catch (e) {
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true },
      });
    }
  } else {
    if (id != null) {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
  }
}
