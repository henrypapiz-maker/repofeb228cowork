/**
 * AlioFoundry Agent Scan Endpoint
 * POST /api/agent-scan
 *
 * Triggers the AlioFoundry Intelligence Agent to scan web sources,
 * score findings, and save to database.
 *
 * Runs the Cowork skill: alioFoundry-agent-SKILL.md
 *
 * Auth: Requires x-api-key header matching ADMIN_API_KEY
 * Response: JSON with scan results, timestamp, and findings count
 */

const handler = async (req, res) => {
  // Verify admin API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const startTime = Date.now();

    // Call Anthropic API with the AlioFoundry agent skill prompt
    // In production, this would call your Cowork skill or Anthropic API directly
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5-20251101',
        max_tokens: 4096,
        system: `You are the AlioFoundry Intelligence Agent. Your role is to discover, evaluate, and score enterprise AI developments that matter to CFOs, PE operators, and enterprise technology leaders.

You must return ONLY valid JSON in this format:
[
  {
    "source_url": "https://...",
    "source_name": "Publication Name",
    "title": "Finding Title",
    "date": "YYYY-MM-DD",
    "industry_id": 1-7,
    "category": "Category Name",
    "scores": {
      "relevance": 1-5,
      "evidence_quality": 1-5,
      "actionability": 1-5,
      "novelty": 1-5,
      "source_authority": 1-5,
      "documentation_quality": 1-5
    },
    "total_score": 5-30,
    "classification": "CRITICAL|HIGH|STANDARD|LOW|SKIP",
    "summary": "20-250 word summary",
    "key_stats": ["stat1", "stat2"],
    "tools_mentioned": ["tool1", "tool2"],
    "documentation_links": ["https://...", "https://..."],
    "action": "add_to_industry_scan"
  }
]

Scoring thresholds:
- 24-30 CRITICAL
- 18-23 HIGH
- 12-17 STANDARD
- 6-11 LOW
- <6 SKIP

Documentation Quality dimension (6th):
- 5 = Working code samples, open repos, API docs available
- 4 = Code snippets or reference implementations
- 3 = Technical white papers or detailed blog posts
- 2 = Case studies mentioning technical approach
- 1 = Press releases only, NO code/specs`,
        messages: [
          {
            role: 'user',
            content: `Run the weekly AlioFoundry scan across all 7 verticals. Search for the latest AI developments in:
1. Finance & Accounting (agentic AI, close automation)
2. PE & M&A (deal sourcing, valuation AI)
3. Legal Tech (contract review, compliance)
4. Manufacturing & Distribution (supply chain, inventory)
5. Enterprise Software (new platforms, SaaS disruption)
6. Healthcare (clinical decision support, revenue cycle)
7. Aerospace & Defense (predictive maintenance, autonomous systems)

Return 5-15 high-quality findings, mix of CRITICAL/HIGH/STANDARD classifications, with strong documentation quality emphasis.`,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: 'Claude API error',
        details: data,
      });
    }

    // Parse Claude's response
    const content = data.content[0].text;
    let findings = [];

    try {
      // Extract JSON from response (Claude might add markdown code blocks)
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

    // Save findings to database or file storage
    // TODO: Implement database write using DATABASE_URL
    const timestamp = new Date().toISOString();
    const scanId = timestamp.split('T')[0]; // YYYY-MM-DD

    // In production, save to: alioFoundry-scans/{date}-findings.json
    // For now, return the findings

    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      scan_id: scanId,
      timestamp,
      findings_count: findings.length,
      critical_count: findings.filter((f) => f.classification === 'CRITICAL').length,
      high_count: findings.filter((f) => f.classification === 'HIGH').length,
      standard_count: findings.filter((f) => f.classification === 'STANDARD').length,
      avg_score: (findings.reduce((sum, f) => sum + f.total_score, 0) / findings.length).toFixed(1),
      duration_ms: duration,
      findings: findings,
    });
  } catch (error) {
    console.error('Agent scan error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
};

export default handler;
