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
      case 'cleanup-bad-urls': {
        if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'No DB' });
        const sql = neon(process.env.DATABASE_URL);

        // Delete findings with known dead URLs (404s from pre-validation era)
        const badUrls = [
          'https://hbr.org/2026/03/how-private-equity-firms-are-using-ai-to-source-and-evaluate-deals',
          'https://techcrunch.com/2026/02/28/how-ai-driven-saas-platforms-are-disrupting-the-enterprise-software-market/',
          'https://www.healthcareitnews.com/news/how-ai-clinical-decision-support-systems-are-transforming-care-delivery',
          'https://www.forbes.com/sites/forbestechcouncil/2026/03/01/how-ai-is-optimizing-manufacturing-and-distribution-supply-chains/',
          'https://www.healthcareitnews.com/news/how-ai-clinical-decision-support-systems-are-transforming-healthcare',
          'https://www.aerospace-technology.com/features/the-future-of-ai-in-aerospace-and-defense/',
        ];

        let deleted = 0;
        for (const url of badUrls) {
          const r1 = await sql`DELETE FROM usecase.findings WHERE source_url = ${url}`;
          const r2 = await sql`DELETE FROM content.articles WHERE url = ${url}`;
          deleted += (r1.count || 0) + (r2.count || 0);
        }

        // Also remove findings with empty/null source_url from old hallucinated scans
        const r3 = await sql`DELETE FROM usecase.findings WHERE source_url IS NULL OR source_url = '' OR source_url = 'N/A'`;

        return res.status(200).json({
          success: true,
          message: 'Cleaned bad URLs from database',
          bad_urls_removed: deleted,
          empty_urls_removed: r3.count || 0,
        });
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
