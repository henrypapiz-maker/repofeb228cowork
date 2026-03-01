/**
 * AlioFoundry Dashboard Action Proxy
 * GET /api/action?run=scan|daily|weekly|alert|health
 *
 * Proxies dashboard button clicks to the real API endpoints using
 * the server-side ADMIN_API_KEY. No key needed from the frontend.
 * Validates requests come from the same origin.
 */

import { neon } from '@neondatabase/serverless';

const handler = async (req, res) => {
  // Allow CORS for same-origin dashboard requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.run;
  if (!action) {
    return res.status(400).json({ error: 'Missing ?run= parameter', valid: ['scan', 'daily', 'weekly', 'alert', 'health'] });
  }

  const host = req.headers.host;
  const apiKey = process.env.ADMIN_API_KEY;

  try {
    switch (action) {
      case 'scan': {
        const r = await fetch(`https://${host}/api/agent-scan?key=${apiKey}`);
        const data = await r.json();
        return res.status(r.status).json(data);
      }
      case 'daily': {
        const r = await fetch(`https://${host}/api/notify?type=daily&key=${apiKey}`);
        const data = await r.json();
        return res.status(r.status).json(data);
      }
      case 'weekly': {
        const r = await fetch(`https://${host}/api/notify?type=weekly&key=${apiKey}`);
        const data = await r.json();
        return res.status(r.status).json(data);
      }
      case 'alert': {
        const r = await fetch(`https://${host}/api/notify?type=alert&key=${apiKey}`);
        const data = await r.json();
        return res.status(r.status).json(data);
      }
      case 'orchestrate': {
        const r = await fetch(`https://${host}/api/orchestrate`, {
          headers: { 'x-api-key': apiKey },
        });
        const data = await r.json();
        return res.status(r.status).json(data);
      }
      case 'weekly-summary': {
        const r = await fetch(`https://${host}/api/weekly-summary`);
        const data = await r.json();
        return res.status(r.status).json(data);
      }
      case 'health': {
        const checks = { api: true, db: false, email: false, timestamp: new Date().toISOString() };

        // Test DB
        if (process.env.DATABASE_URL) {
          try {
            const sql = neon(process.env.DATABASE_URL);
            await sql`SELECT 1`;
            checks.db = true;
          } catch (e) { checks.db_error = e.message; }
        }

        // Test Resend
        checks.email = !!process.env.RESEND_API_KEY;
        checks.anthropic = !!process.env.ANTHROPIC_API_KEY;
        checks.serper = !!process.env.SERPER_API_KEY;
        checks.admin_email = process.env.ADMIN_EMAIL || 'not set';

        return res.status(200).json({ success: true, message: 'Health check complete', checks });
      }
      default:
        return res.status(400).json({ error: 'Unknown action: ' + action, valid: ['scan', 'daily', 'weekly', 'alert', 'health', 'orchestrate', 'weekly-summary'] });
    }
  } catch (error) {
    console.error('Action proxy error:', error);
    return res.status(500).json({ error: 'Action failed', message: error.message });
  }
};

export default handler;
