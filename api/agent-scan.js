/**
 * AlioFoundry Agent Scan Endpoint
 * POST /api/agent-scan
 *
 * Triggers the AlioFoundry Intelligence Agent to scan web sources,
 * score findings, and save to Neon database.
 *
 * Auth: Requires x-api-key header or ?key= query param matching ADMIN_API_KEY
 */

import { neon } from '@neondatabase/serverless';

const handler = async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const startTime = Date.now();
    const sql = neon(process.env.DATABASE_URL);

    // Call Anthropic API with the AlioFoundry agent skill prompt
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 4096,
        system: `You are the AlioFoundry Intelligence Agent. Your role is to discover, evaluate, and score enterprise AI developments that matter to CFOs, PE operators, and enterprise technology leaders.

You must return ONLY valid JSON in this format:
[
  {
    "source_url": "https://...",
    "source_name": "Publication Name",
    "title": "Finding Title",
    "date": "YYYY-MM-DD",
    "industry_id": 1,
    "category": "Category Name",
    "scores": {
      "relevance": 1-5,
      "evidence_quality": 1-5,
      "actionability": 1-5,
      "novelty": 1-5,
      "source_authority": 1-5,
      "documentation_quality": 1-5
    },
    "total_score": 6-30,
    "classification": "CRITICAL|HIGH|STANDARD|LOW|SKIP",
    "summary": "20-250 word summary",
    "key_stats": ["stat1", "stat2"],
    "tools_mentioned": ["tool1", "tool2"],
    "documentation_links": ["https://..."],
    "action": "add_to_industry_scan"
  }
]

Industry IDs: 1=Finance & Accounting, 2=PE & M&A, 3=Legal Tech, 4=Manufacturing & Distribution, 5=Enterprise Software, 6=Healthcare, 7=Aerospace & Defense

Scoring thresholds: 24-30 CRITICAL, 18-23 HIGH, 12-17 STANDARD, 6-11 LOW, <6 SKIP

Documentation Quality (6th dimension): 5=Working code/API docs, 4=Code snippets, 3=Technical papers, 2=Case studies, 1=Press releases only`,
        messages: [
          {
            role: 'user',
            content: `Run the AlioFoundry scan across all 7 verticals. Search for the latest AI developments in:
1. Finance & Accounting (agentic AI, close automation)
2. PE & M&A (deal sourcing, valuation AI)
3. Legal Tech (contract review, compliance)
4. Manufacturing & Distribution (supply chain, inventory)
5. Enterprise Software (new platforms, SaaS disruption)
6. Healthcare (clinical decision support, revenue cycle)
7. Aerospace & Defense (predictive maintenance, autonomous systems)

Today's date is ${new Date().toISOString().split('T')[0]}.
Return 5-15 high-quality findings with a mix of CRITICAL/HIGH/STANDARD classifications.`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: 'Claude API error', details: data });
    }

    // Parse Claude's response
    const content = data.content[0].text;
    let findings = [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        findings = JSON.parse(jsonMatch[0]);
      } else {
        findings = JSON.parse(content);
      }
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse Claude response as JSON',
        response: content.substring(0, 500),
      });
    }

    // Write findings to Neon DB
    const today = new Date().toISOString().split('T')[0];
    let insertedCount = 0;

    for (const f of findings) {
      if (f.classification === 'SKIP') continue;

      try {
        await sql`
          INSERT INTO usecase.findings (
            source_url, source_name, title, date, industry_id, category, summary,
            relevance_score, evidence_quality_score, actionability_score,
            novelty_score, source_authority_score, documentation_quality_score,
            total_score, classification,
            key_stats, tools_mentioned, documentation_links, action,
            status, week_added
          ) VALUES (
            ${f.source_url || ''},
            ${f.source_name || 'Unknown'},
            ${f.title},
            ${f.date || today},
            ${f.industry_id || 5},
            ${f.category || 'General'},
            ${f.summary},
            ${f.scores?.relevance || 3},
            ${f.scores?.evidence_quality || 3},
            ${f.scores?.actionability || 3},
            ${f.scores?.novelty || 3},
            ${f.scores?.source_authority || 3},
            ${f.scores?.documentation_quality || 3},
            ${f.total_score || 18},
            ${f.classification || 'STANDARD'},
            ${Array.isArray(f.key_stats) ? f.key_stats.join('; ') : (f.key_stats || '')},
            ${Array.isArray(f.tools_mentioned) ? f.tools_mentioned.join(', ') : (f.tools_mentioned || '')},
            ${Array.isArray(f.documentation_links) ? f.documentation_links.join('; ') : (f.documentation_links || '')},
            ${f.action || 'add_to_industry_scan'},
            'Agent-Scanned',
            ${today}
          )
        `;
        insertedCount++;
      } catch (dbErr) {
        console.error('DB insert error for finding:', f.title, dbErr.message);
      }
    }

    // Log the scan run
    const duration = Date.now() - startTime;
    const criticalCount = findings.filter(f => f.classification === 'CRITICAL').length;
    const highCount = findings.filter(f => f.classification === 'HIGH').length;
    const standardCount = findings.filter(f => f.classification === 'STANDARD').length;
    const lowCount = findings.filter(f => f.classification === 'LOW').length;
    const skipCount = findings.filter(f => f.classification === 'SKIP').length;
    const avgScore = findings.length > 0
      ? (findings.reduce((sum, f) => sum + (f.total_score || 0), 0) / findings.length).toFixed(1)
      : 0;

    try {
      await sql`
        INSERT INTO operations.scan_runs (
          scan_date, start_time, end_time,
          findings_count, critical_count, high_count, standard_count, low_count, skip_count,
          avg_score, status, notes
        ) VALUES (
          ${today},
          ${new Date(startTime).toISOString()},
          ${new Date().toISOString()},
          ${insertedCount}, ${criticalCount}, ${highCount}, ${standardCount}, ${lowCount}, ${skipCount},
          ${avgScore}, 'completed',
          ${'Duration: ' + duration + 'ms. Model: claude-sonnet-4-5.'}
        )
        ON CONFLICT (scan_date) DO UPDATE SET
          end_time = EXCLUDED.end_time,
          findings_count = operations.scan_runs.findings_count + EXCLUDED.findings_count,
          critical_count = operations.scan_runs.critical_count + EXCLUDED.critical_count,
          high_count = operations.scan_runs.high_count + EXCLUDED.high_count,
          standard_count = operations.scan_runs.standard_count + EXCLUDED.standard_count,
          avg_score = EXCLUDED.avg_score,
          status = 'completed',
          notes = EXCLUDED.notes
      `;
    } catch (logErr) {
      console.error('Scan run log error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      scan_id: today,
      timestamp: new Date().toISOString(),
      findings_count: insertedCount,
      critical_count: criticalCount,
      high_count: highCount,
      standard_count: standardCount,
      avg_score: avgScore,
      duration_ms: duration,
      findings,
    });
  } catch (error) {
    console.error('Agent scan error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

export default handler;
