/**
 * AlioFoundry Agent Scan Endpoint
 * POST/GET /api/agent-scan
 *
 * "Search First, Analyze Second" pipeline:
 * 1. Serper searches real articles across 7 industry verticals
 * 2. Claude Haiku scores and classifies the real findings
 * 3. Writes to usecase.findings, content.articles, content.repositories
 *
 * Auth: Requires x-api-key header or ?key= query param matching ADMIN_API_KEY
 */

import { neon } from '@neondatabase/serverless';

// 3 queries per vertical: general search, news, GitHub repos
const SEARCH_QUERIES = [
  { industry_id: 1, type: 'search', q: 'AI automation finance accounting CFO close process 2026' },
  { industry_id: 1, type: 'news',   q: 'agentic AI finance accounting ERP automation' },
  { industry_id: 1, type: 'repo',   q: 'AI finance accounting automation agent site:github.com' },

  { industry_id: 2, type: 'search', q: 'AI private equity M&A deal sourcing valuation 2026' },
  { industry_id: 2, type: 'news',   q: 'AI private equity due diligence portfolio value creation' },
  { industry_id: 2, type: 'repo',   q: 'AI due diligence M&A deal analysis site:github.com' },

  { industry_id: 3, type: 'search', q: 'AI legal tech contract review compliance automation 2026' },
  { industry_id: 3, type: 'news',   q: 'AI legal contract analysis NLP eDiscovery' },
  { industry_id: 3, type: 'repo',   q: 'AI legal contract review NLP site:github.com' },

  { industry_id: 4, type: 'search', q: 'AI manufacturing supply chain demand forecasting 2026' },
  { industry_id: 4, type: 'news',   q: 'AI supply chain inventory optimization manufacturing' },
  { industry_id: 4, type: 'repo',   q: 'AI supply chain forecasting manufacturing site:github.com' },

  { industry_id: 5, type: 'search', q: 'AI enterprise software SaaS platform agent SDK 2026' },
  { industry_id: 5, type: 'news',   q: 'AI developer tools agentic framework enterprise platform' },
  { industry_id: 5, type: 'repo',   q: 'AI agent framework enterprise SDK site:github.com' },

  { industry_id: 6, type: 'search', q: 'AI healthcare clinical decision support revenue cycle 2026' },
  { industry_id: 6, type: 'news',   q: 'AI healthcare diagnostic FDA approval clinical' },
  { industry_id: 6, type: 'repo',   q: 'AI healthcare clinical NLP medical site:github.com' },

  { industry_id: 7, type: 'search', q: 'AI aerospace defense predictive maintenance autonomous 2026' },
  { industry_id: 7, type: 'news',   q: 'AI defense predictive maintenance threat detection autonomous' },
  { industry_id: 7, type: 'repo',   q: 'AI predictive maintenance aerospace defense site:github.com' },
];

const INDUSTRY_NAMES = {
  1: 'Finance & Accounting', 2: 'PE & M&A', 3: 'Legal Tech',
  4: 'Manufacturing & Distribution', 5: 'Enterprise Software',
  6: 'Healthcare', 7: 'Aerospace & Defense',
};

function extractSourceName(url) {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    const names = {
      'mckinsey.com': 'McKinsey', 'gartner.com': 'Gartner', 'forrester.com': 'Forrester',
      'deloitte.com': 'Deloitte', 'pwc.com': 'PwC', 'accenture.com': 'Accenture',
      'bain.com': 'Bain & Company', 'bcg.com': 'BCG', 'kpmg.com': 'KPMG', 'ey.com': 'EY',
      'forbes.com': 'Forbes', 'techcrunch.com': 'TechCrunch', 'reuters.com': 'Reuters',
      'bloomberg.com': 'Bloomberg', 'wsj.com': 'Wall Street Journal', 'ft.com': 'Financial Times',
      'hbr.org': 'Harvard Business Review', 'mit.edu': 'MIT', 'arxiv.org': 'arXiv',
      'github.com': 'GitHub', 'gitlab.com': 'GitLab', 'medium.com': 'Medium',
      'venturebeat.com': 'VentureBeat', 'wired.com': 'Wired', 'zdnet.com': 'ZDNet',
      'openai.com': 'OpenAI', 'anthropic.com': 'Anthropic', 'google.com': 'Google',
      'microsoft.com': 'Microsoft', 'aws.amazon.com': 'AWS', 'ibm.com': 'IBM',
    };
    return names[host] || host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);
  } catch { return 'Unknown'; }
}

async function searchSerper(query) {
  try {
    const body = { q: query.q, num: 10 };
    if (query.type === 'news') body.type = 'news';

    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || data.news || []).map(r => ({
      url: r.link,
      title: r.title || '',
      snippet: r.snippet || '',
      date: r.date || null,
      source_name: extractSourceName(r.link),
      industry_id: query.industry_id,
      is_repo: query.type === 'repo' || /github\.com|gitlab\.com/.test(r.link),
    }));
  } catch (err) {
    console.error('Serper search error:', query.q, err.message);
    return [];
  }
}

function parseGitHubUrl(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;
  return { owner: match[1], name: match[2].replace(/\.git$/, ''), platform: 'github' };
}

const handler = async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.SERPER_API_KEY) {
    return res.status(503).json({ error: 'SERPER_API_KEY not configured. Required for real article search.' });
  }

  try {
    const startTime = Date.now();
    const sql = neon(process.env.DATABASE_URL);
    const today = new Date().toISOString().split('T')[0];

    // ─── PHASE 1: SEARCH ───
    console.log('Phase 1: Searching across 7 verticals...');
    const allResults = await Promise.all(SEARCH_QUERIES.map(searchSerper));
    const flatResults = allResults.flat();

    // Deduplicate by URL
    const seen = new Set();
    const unique = [];
    for (const r of flatResults) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      unique.push(r);
    }

    // Partition: articles vs repos
    const articles = unique.filter(r => !r.is_repo);
    const repos = unique.filter(r => r.is_repo && /github\.com|gitlab\.com/.test(r.url));

    console.log(`Found ${unique.length} unique results (${articles.length} articles, ${repos.length} repos)`);

    // ─── PHASE 2: SCORE WITH CLAUDE ───
    console.log('Phase 2: Scoring articles with Claude...');
    const scoredFindings = [];
    const batchSize = 10;

    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      try {
        const batchText = batch.map((a, idx) => (
          `[${idx + 1}] URL: ${a.url}\nTitle: ${a.title}\nSnippet: ${a.snippet}\nSource: ${a.source_name}\nDate: ${a.date || 'Unknown'}\nIndustry ID: ${a.industry_id} (${INDUSTRY_NAMES[a.industry_id]})`
        )).join('\n\n');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 4096,
            system: `You are the AlioFoundry Intelligence Scoring Agent. You receive REAL articles found by web search. Score each using the 6-dimension rubric.

CRITICAL RULES:
- Use the EXACT URL provided. Do NOT modify or fabricate URLs.
- Use the exact title provided.
- Write a 50-200 word summary based on the snippet and your knowledge of the topic.
- total_score MUST equal the sum of all 6 individual scores.

Return ONLY a JSON array:
[{
  "url": "(exact URL from input)",
  "title": "(exact title from input)",
  "source_name": "(source from input)",
  "date": "YYYY-MM-DD or null",
  "industry_id": (number from input),
  "category": "descriptive category",
  "scores": {
    "relevance": 1-5,
    "evidence_quality": 1-5,
    "actionability": 1-5,
    "novelty": 1-5,
    "source_authority": 1-5,
    "documentation_quality": 1-5
  },
  "classification": "CRITICAL|HIGH|STANDARD|LOW|SKIP",
  "summary": "50-200 word summary",
  "key_stats": ["stat1", "stat2"],
  "tools_mentioned": ["tool1", "tool2"]
}]

Scoring: relevance=how applicable to the industry vertical, evidence_quality=quantified evidence in snippet, actionability=can enterprise act on this, novelty=new development vs well-known, source_authority=tier of source, documentation_quality=technical depth.

Classification thresholds: 24-30 CRITICAL, 18-23 HIGH, 12-17 STANDARD, 6-11 LOW, <6 SKIP`,
            messages: [{
              role: 'user',
              content: `Score these ${batch.length} articles. Today is ${today}.\n\n${batchText}`,
            }],
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          console.error('Claude API error on batch', i / batchSize, data);
          continue;
        }

        const content = data.content[0].text;
        let parsed = [];
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
        } catch (parseErr) {
          console.error('JSON parse error on batch', i / batchSize);
          continue;
        }

        // Validate and fix scores server-side
        for (const f of parsed) {
          const s = f.scores || {};
          const r = Math.min(5, Math.max(1, s.relevance || 3));
          const eq = Math.min(5, Math.max(1, s.evidence_quality || 3));
          const ac = Math.min(5, Math.max(1, s.actionability || 3));
          const no = Math.min(5, Math.max(1, s.novelty || 3));
          const sa = Math.min(5, Math.max(1, s.source_authority || 3));
          const dq = Math.min(5, Math.max(1, s.documentation_quality || 3));
          const total = r + eq + ac + no + sa + dq;

          f.scores = { relevance: r, evidence_quality: eq, actionability: ac, novelty: no, source_authority: sa, documentation_quality: dq };
          f.total_score = total;
          f.classification = total >= 24 ? 'CRITICAL' : total >= 18 ? 'HIGH' : total >= 12 ? 'STANDARD' : total >= 6 ? 'LOW' : 'SKIP';

          // Ensure summary meets minimum length
          if (!f.summary || f.summary.length < 20) {
            const orig = batch.find(b => b.url === f.url);
            f.summary = orig ? `${orig.title}. ${orig.snippet}` : f.title || 'AI development finding.';
            if (f.summary.length < 20) f.summary = f.summary + ' — Enterprise AI intelligence finding discovered via web search.';
          }

          scoredFindings.push(f);
        }
      } catch (batchErr) {
        console.error('Batch scoring error:', batchErr.message);
      }
    }

    console.log(`Scored ${scoredFindings.length} findings`);

    // ─── PHASE 3: WRITE TO DB ───
    console.log('Phase 3: Writing to database...');
    let insertedCount = 0;

    for (const f of scoredFindings) {
      if (f.classification === 'SKIP') continue;

      try {
        // Insert into usecase.findings
        await sql`
          INSERT INTO usecase.findings (
            source_url, source_name, title, date, industry_id, category, summary,
            relevance_score, evidence_quality_score, actionability_score,
            novelty_score, source_authority_score, documentation_quality_score,
            total_score, classification,
            key_stats, tools_mentioned, documentation_links, action,
            status, week_added
          ) VALUES (
            ${f.url || ''},
            ${f.source_name || 'Unknown'},
            ${(f.title || '').substring(0, 500)},
            ${f.date || today},
            ${f.industry_id || 5},
            ${f.category || 'General'},
            ${(f.summary || '').substring(0, 2500)},
            ${f.scores.relevance},
            ${f.scores.evidence_quality},
            ${f.scores.actionability},
            ${f.scores.novelty},
            ${f.scores.source_authority},
            ${f.scores.documentation_quality},
            ${f.total_score},
            ${f.classification},
            ${Array.isArray(f.key_stats) ? f.key_stats.join('; ') : (f.key_stats || '')},
            ${Array.isArray(f.tools_mentioned) ? f.tools_mentioned.join(', ') : (f.tools_mentioned || '')},
            ${''},
            ${'add_to_industry_scan'},
            'Agent-Scanned',
            ${today}
          )
        `;
        insertedCount++;

        // Also insert into content.articles
        if (f.url && f.url.startsWith('http')) {
          try {
            await sql`
              INSERT INTO content.articles (url, title, source_name, published_date, industry_id, summary)
              VALUES (${f.url}, ${(f.title || '').substring(0, 500)}, ${f.source_name || 'Unknown'}, ${f.date || today}, ${f.industry_id || 5}, ${(f.summary || '').substring(0, 2500)})
              ON CONFLICT (url) DO NOTHING
            `;
          } catch (artErr) {
            console.error('Article insert error:', artErr.message);
          }
        }
      } catch (dbErr) {
        console.error('DB insert error for finding:', f.title, dbErr.message);
      }
    }

    // Insert repos
    let repoCount = 0;
    for (const r of repos) {
      const parsed = parseGitHubUrl(r.url);
      if (!parsed) continue;
      try {
        await sql`
          INSERT INTO content.repositories (url, name, owner, platform, industry_id, description)
          VALUES (${r.url}, ${parsed.name}, ${parsed.owner}, ${parsed.platform}, ${r.industry_id}, ${r.snippet || r.title || ''})
          ON CONFLICT (url) DO NOTHING
        `;
        repoCount++;
      } catch (repoErr) {
        console.error('Repo insert error:', repoErr.message);
      }
    }

    // ─── PHASE 4: LOG AND NOTIFY ───
    const duration = Date.now() - startTime;
    const criticalCount = scoredFindings.filter(f => f.classification === 'CRITICAL').length;
    const highCount = scoredFindings.filter(f => f.classification === 'HIGH').length;
    const standardCount = scoredFindings.filter(f => f.classification === 'STANDARD').length;
    const lowCount = scoredFindings.filter(f => f.classification === 'LOW').length;
    const skipCount = scoredFindings.filter(f => f.classification === 'SKIP').length;
    const avgScore = scoredFindings.length > 0
      ? (scoredFindings.reduce((sum, f) => sum + (f.total_score || 0), 0) / scoredFindings.length).toFixed(1)
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
          ${'Deep search scan. ' + unique.length + ' sources found, ' + scoredFindings.length + ' scored, ' + insertedCount + ' inserted, ' + repoCount + ' repos. Duration: ' + duration + 'ms.'}
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

    // Auto-send daily digest email
    let emailSent = false;
    if (insertedCount > 0 && process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL) {
      try {
        const notifyUrl = `https://${req.headers.host}/api/notify?type=daily&key=${process.env.ADMIN_API_KEY}`;
        const emailRes = await fetch(notifyUrl);
        const emailData = await emailRes.json();
        emailSent = emailData.success || false;
      } catch (emailErr) {
        console.error('Auto-notify error:', emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      scan_id: today,
      timestamp: new Date().toISOString(),
      sources_searched: unique.length,
      articles_found: articles.length,
      repos_found: repos.length,
      findings_scored: scoredFindings.length,
      findings_inserted: insertedCount,
      repos_inserted: repoCount,
      critical_count: criticalCount,
      high_count: highCount,
      standard_count: standardCount,
      avg_score: avgScore,
      duration_ms: duration,
      email_sent: emailSent,
      findings: scoredFindings.filter(f => f.classification !== 'SKIP'),
    });
  } catch (error) {
    console.error('Agent scan error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

export default handler;
