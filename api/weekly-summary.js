/**
 * AlioFoundry Weekly Summary API
 * GET /api/weekly-summary
 *
 * Returns structured JSON for the dashboard Weekly Report tab.
 * Queries live data from Neon DB: findings, articles, repos, scan activity.
 * No auth required (read-only).
 */

import { neon } from '@neondatabase/serverless';

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'DATABASE_URL not configured' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    // Top findings this week with real URLs
    const findings = await sql`
      SELECT f.*, i.name AS industry_name
      FROM usecase.findings f
      LEFT JOIN usecase.industries i ON f.industry_id = i.industry_id
      WHERE f.date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY f.total_score DESC
      LIMIT 20
    `;

    // Summary stats
    const summary = await sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN classification = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN classification = 'HIGH' THEN 1 ELSE 0 END) AS high,
        SUM(CASE WHEN classification = 'STANDARD' THEN 1 ELSE 0 END) AS standard,
        SUM(CASE WHEN classification = 'LOW' THEN 1 ELSE 0 END) AS low,
        ROUND(AVG(total_score)::numeric, 1) AS avg_score,
        MAX(total_score) AS max_score
      FROM usecase.findings
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
    `;

    // By industry
    const byIndustry = await sql`
      SELECT i.name, i.industry_id, COUNT(*) AS cnt,
        SUM(CASE WHEN f.classification = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN f.classification = 'HIGH' THEN 1 ELSE 0 END) AS high,
        ROUND(AVG(f.total_score)::numeric, 1) AS avg_score
      FROM usecase.findings f
      JOIN usecase.industries i ON f.industry_id = i.industry_id
      WHERE f.date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY i.name, i.industry_id
      ORDER BY cnt DESC
    `;

    // Scan activity
    const scans = await sql`
      SELECT scan_date, findings_count, critical_count, high_count, avg_score, status, notes
      FROM operations.scan_runs
      WHERE scan_date >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY scan_date DESC
    `;

    // Recent articles (from content.articles)
    const articles = await sql`
      SELECT a.*, i.name AS industry_name
      FROM content.articles a
      LEFT JOIN usecase.industries i ON a.industry_id = i.industry_id
      ORDER BY a.created_at DESC
      LIMIT 15
    `;

    // Recent repos (from content.repositories)
    const repos = await sql`
      SELECT r.*, i.name AS industry_name
      FROM content.repositories r
      LEFT JOIN usecase.industries i ON r.industry_id = i.industry_id
      ORDER BY r.created_at DESC
      LIMIT 10
    `;

    const weekOf = new Date();
    weekOf.setDate(weekOf.getDate() - weekOf.getDay());

    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      week_of: weekOf.toISOString().split('T')[0],
      summary: summary[0] || { total: 0, critical: 0, high: 0, standard: 0, low: 0, avg_score: 0, max_score: 0 },
      top_findings: findings,
      by_industry: byIndustry,
      scan_activity: scans,
      recent_articles: articles,
      recent_repos: repos,
    });
  } catch (error) {
    console.error('Weekly summary error:', error);
    return res.status(500).json({ error: 'Failed to generate weekly summary', message: error.message });
  }
};

export default handler;
