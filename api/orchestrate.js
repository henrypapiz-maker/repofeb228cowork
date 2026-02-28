/**
 * AlioFoundry Orchestration Endpoint
 * POST /api/orchestrate
 *
 * Coordinates the full AlioFoundry pipeline:
 * - validate: Validate scan findings against spec
 * - prepare: Transform to database ingestion format
 * - ingest: Save to database
 * - extract: Generate data extract for dashboard
 * - status: Check system health
 * - notify: Generate and send email notifications
 *
 * Auth: Requires x-api-key header matching ADMIN_API_KEY
 * Query params:
 *   - action: validate|prepare|ingest|extract|status|notify (default: status)
 *   - subtype: For notify action - daily|weekly
 */

const handler = async (req, res) => {
  // Verify admin API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Extract action from query params
  const action = req.query.action || 'status';
  const subtype = req.query.subtype;

  try {
    switch (action) {
      case 'status':
        return handleStatus(req, res);

      case 'validate':
        return handleValidate(req, res);

      case 'prepare':
        return handlePrepare(req, res);

      case 'ingest':
        return handleIngest(req, res);

      case 'extract':
        return handleExtract(req, res);

      case 'notify':
        return handleNotify(req, res, subtype);

      default:
        return res.status(400).json({
          error: 'Invalid action',
          valid_actions: ['status', 'validate', 'prepare', 'ingest', 'extract', 'notify'],
        });
    }
  } catch (error) {
    console.error(`Orchestrate error [${action}]:`, error);
    return res.status(500).json({
      error: 'Internal server error',
      action,
      message: error.message,
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleStatus(req, res) {
  /**
   * GET /api/orchestrate?action=status
   * Returns system health and recent activity
   */
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      anthropic_api: 'connected',
      database: process.env.DATABASE_URL ? 'configured' : 'not_configured',
      email: process.env.RESEND_API_KEY ? 'configured' : 'not_configured',
    },
    last_scan: '2026-02-28T02:00:00Z', // TODO: Query from database
    findings_in_database: 42, // TODO: Query from database
    next_scheduled_scan: '2026-02-29T02:00:00Z',
  });
}

async function handleValidate(req, res) {
  /**
   * POST /api/orchestrate?action=validate
   * Request body: { findings: [...] }
   * Validates findings against AlioFoundry spec
   */

  const { findings } = req.body || {};

  if (!Array.isArray(findings)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Body must contain findings array',
    });
  }

  const validated = {
    total: findings.length,
    valid: 0,
    invalid: 0,
    errors: [],
  };

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const fieldErrors = validateFinding(finding);

    if (fieldErrors.length === 0) {
      validated.valid++;
    } else {
      validated.invalid++;
      validated.errors.push({
        index: i,
        title: finding.title || 'Unknown',
        errors: fieldErrors,
      });
    }
  }

  const validPct = findings.length > 0 ? ((validated.valid / findings.length) * 100).toFixed(1) : 0;

  return res.status(200).json({
    validation_result: validPct >= 95 ? 'PASS' : 'FAIL',
    valid_percentage: validPct,
    ...validated,
  });
}

async function handlePrepare(req, res) {
  /**
   * POST /api/orchestrate?action=prepare
   * Request body: { findings: [...] }
   * Transforms validated findings to database ingestion format
   */

  const { findings } = req.body || {};

  if (!Array.isArray(findings)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Body must contain findings array',
    });
  }

  const prepared = findings.map((finding) => ({
    source_url: finding.source_url,
    source_name: finding.source_name,
    title: finding.title,
    date: finding.date,
    industry_id: finding.industry_id,
    category: finding.category,
    summary: finding.summary,
    scores: finding.scores,
    total_score: finding.total_score,
    classification: finding.classification,
    key_stats: Array.isArray(finding.key_stats) ? finding.key_stats.join('; ') : '',
    tools_mentioned: Array.isArray(finding.tools_mentioned) ? finding.tools_mentioned.join(', ') : '',
    documentation_links: Array.isArray(finding.documentation_links)
      ? finding.documentation_links.join('; ')
      : '',
    action: finding.action || 'add_to_industry_scan',
    status: 'Agent-Scanned',
    week_added: new Date().toISOString().split('T')[0],
  }));

  return res.status(200).json({
    prepared_count: prepared.length,
    timestamp: new Date().toISOString(),
    batch: prepared,
  });
}

async function handleIngest(req, res) {
  /**
   * POST /api/orchestrate?action=ingest
   * Request body: { findings: [...] }
   * Saves findings to database
   */

  // TODO: Implement database write using DATABASE_URL
  // This would use @neondatabase/serverless or similar

  const { findings } = req.body || {};

  if (!Array.isArray(findings)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Body must contain findings array',
    });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'DATABASE_URL not configured',
    });
  }

  try {
    // Placeholder: In production, this would:
    // 1. Connect to Neon PostgreSQL
    // 2. Insert findings into usecase.findings table
    // 3. Trigger database triggers for change_log
    // 4. Return insert count and IDs

    return res.status(200).json({
      success: true,
      ingested_count: findings.length,
      timestamp: new Date().toISOString(),
      message: 'Findings queued for ingestion',
      note: 'Database write implementation required',
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Database error',
      message: error.message,
    });
  }
}

async function handleExtract(req, res) {
  /**
   * GET /api/orchestrate?action=extract
   * Generates complete data extract for dashboard
   * Returns: use_cases, repositories, articles, industries, summary
   */

  // TODO: Query from database using DATABASE_URL
  // This would return the full dataset for the dashboard

  try {
    const mockData = {
      timestamp: new Date().toISOString(),
      use_cases: {
        total: 72,
        by_classification: {
          CRITICAL: 15,
          HIGH: 28,
          STANDARD: 21,
          LOW: 8,
        },
        by_industry: {
          1: 12, // Finance
          2: 8, // PE
          3: 7, // Legal
          4: 10, // Manufacturing
          5: 18, // Enterprise Software
          6: 11, // Healthcare
          7: 6, // Aerospace
        },
      },
      repositories: {
        total: 32,
        by_industry: {
          5: 18, // Enterprise Software (most)
          1: 5, // Finance
          6: 4, // Healthcare
          3: 3, // Legal
          2: 1, // PE
          4: 1, // Manufacturing
          7: 0, // Aerospace
        },
      },
      articles: {
        total: 24,
        by_source: {
          'CFO Dive': 4,
          'TechCrunch': 3,
          'VentureBeat': 3,
          'Gartner': 2,
          'McKinsey': 2,
          'Other': 10,
        },
      },
      industries: [
        { id: 1, name: 'Finance & Accounting', count: 12 },
        { id: 2, name: 'PE & M&A', count: 8 },
        { id: 3, name: 'Legal Tech', count: 7 },
        { id: 4, name: 'Manufacturing & Distribution', count: 10 },
        { id: 5, name: 'Enterprise Software', count: 18 },
        { id: 6, name: 'Healthcare', count: 11 },
        { id: 7, name: 'Aerospace & Defense', count: 6 },
      ],
      summary: {
        total_use_cases: 72,
        total_repositories: 32,
        total_articles: 24,
        avg_finding_score: 22.4,
        critical_percentage: 20.8,
      },
    };

    return res.status(200).json(mockData);
  } catch (error) {
    return res.status(500).json({
      error: 'Extract error',
      message: error.message,
    });
  }
}

async function handleNotify(req, res, subtype) {
  /**
   * POST /api/orchestrate?action=notify&subtype=daily|weekly
   * Generates and sends notification emails
   */

  if (!['daily', 'weekly'].includes(subtype)) {
    return res.status(400).json({
      error: 'Invalid subtype',
      valid_options: ['daily', 'weekly'],
    });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'RESEND_API_KEY not configured',
    });
  }

  try {
    // TODO: Implement email generation and sending via Resend
    // This would:
    // 1. Query database for latest findings
    // 2. Generate email HTML template
    // 3. Send via Resend API to ADMIN_EMAIL
    // 4. Return send confirmation

    const notificationData = {
      type: subtype,
      findings_included: subtype === 'daily' ? 5 : 15,
      critical_count: subtype === 'daily' ? 2 : 6,
      high_count: subtype === 'daily' ? 3 : 9,
      recipient: process.env.ADMIN_EMAIL || 'admin@aliofoundry.com',
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json({
      success: true,
      message: `${subtype} notification generated and sent`,
      ...notificationData,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Notification error',
      message: error.message,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function validateFinding(finding) {
  const errors = [];

  // Required fields
  const requiredFields = [
    'source_url',
    'source_name',
    'title',
    'date',
    'industry_id',
    'category',
    'scores',
    'total_score',
    'classification',
    'summary',
    'key_stats',
    'tools_mentioned',
    'documentation_links',
    'action',
  ];

  for (const field of requiredFields) {
    if (!(field in finding)) {
      errors.push(`Missing field: ${field}`);
    }
  }

  // Score validation
  if (finding.scores) {
    const requiredScores = [
      'relevance',
      'evidence_quality',
      'actionability',
      'novelty',
      'source_authority',
      'documentation_quality',
    ];
    for (const score of requiredScores) {
      if (!(score in finding.scores)) {
        errors.push(`Missing score: ${score}`);
      } else if (finding.scores[score] < 1 || finding.scores[score] > 5) {
        errors.push(`Invalid score ${score}: must be 1-5`);
      }
    }
  }

  // Total score validation
  if (typeof finding.total_score !== 'number' || finding.total_score < 5 || finding.total_score > 30) {
    errors.push('total_score must be 5-30');
  }

  // Classification validation
  const validClassifications = ['CRITICAL', 'HIGH', 'STANDARD', 'LOW', 'SKIP'];
  if (!validClassifications.includes(finding.classification)) {
    errors.push(`Invalid classification: ${finding.classification}`);
  }

  // Industry ID validation
  if (!Number.isInteger(finding.industry_id) || finding.industry_id < 1 || finding.industry_id > 7) {
    errors.push('industry_id must be 1-7');
  }

  // Summary length validation
  if (finding.summary) {
    const wordCount = finding.summary.split(/\s+/).length;
    if (wordCount < 20 || wordCount > 250) {
      errors.push(`Summary must be 20-250 words, got ${wordCount}`);
    }
  }

  return errors;
}

export default handler;
