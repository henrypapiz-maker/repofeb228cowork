/**
 * AlioFoundry Email Notification Endpoint
 * POST /api/notify
 *
 * Generates and sends email notifications for:
 * - Daily intelligence digest
 * - Weekly rollup newsletter
 * - Finding alerts
 *
 * Uses Resend (resend.com) for email delivery
 * Auth: Requires x-api-key header matching ADMIN_API_KEY
 *
 * Query params:
 *   - type: daily|weekly|alert (default: daily)
 *   - recipient: Email address (default: ADMIN_EMAIL)
 */

const handler = async (req, res) => {
  // Verify admin API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const emailType = req.query.type || 'daily';
  const recipient = req.query.recipient || process.env.ADMIN_EMAIL;

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'RESEND_API_KEY not configured',
    });
  }

  try {
    let emailContent;

    switch (emailType) {
      case 'daily':
        emailContent = generateDailyDigest();
        break;
      case 'weekly':
        emailContent = generateWeeklyNewsletter();
        break;
      case 'alert':
        emailContent = generateAlertEmail();
        break;
      default:
        return res.status(400).json({
          error: 'Invalid type',
          valid_types: ['daily', 'weekly', 'alert'],
        });
    }

    // Send via Resend API
    const sendResult = await sendEmail({
      to: recipient,
      from: process.env.FROM_EMAIL || 'intelligence@aliofoundry.com',
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return res.status(200).json({
      success: true,
      message: `${emailType} notification sent`,
      type: emailType,
      recipient,
      timestamp: new Date().toISOString(),
      email_id: sendResult.id || 'mock-id',
    });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({
      error: 'Email send failed',
      message: error.message,
    });
  }
};

/**
 * Send email via Resend API
 */
async function sendEmail(emailData) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      headers: {
        'X-Entity-Ref-ID': new Date().getTime().toString(),
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Resend API error: ${error.message}`);
  }

  return await response.json();
}

/**
 * Generate daily digest email
 */
function generateDailyDigest() {
  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: `AlioFoundry Daily Intelligence — ${date}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Calibri', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1B4332; color: white; padding: 20px; border-radius: 8px; }
    .header h1 { margin: 0; font-family: Georgia, serif; font-size: 28px; }
    .finding { border-left: 4px solid #1B4332; padding: 15px; margin: 15px 0; background: #f9f9f9; }
    .critical { border-left-color: #d62828; }
    .high { border-left-color: #f77f00; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-right: 8px; }
    .critical-badge { background: #d62828; color: white; }
    .high-badge { background: #f77f00; color: white; }
    .finding h3 { margin: 0 0 8px 0; font-family: Georgia, serif; }
    .source { color: #666; font-size: 12px; }
    .score { margin: 10px 0; font-size: 14px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AlioFoundry Intelligence</h1>
      <p>Daily Digest — ${date}</p>
    </div>

    <h2>Today's Top Findings</h2>
    <p>5 new enterprise AI developments in your tracked verticals.</p>

    <div class="finding critical">
      <span class="badge critical-badge">CRITICAL</span>
      <h3>HPE CFO Deploys Agentic AI for Financial Close</h3>
      <p class="source">CFO Dive • Feb 27, 2026</p>
      <p>HPE has deployed a Deloitte-built agentic AI system that automates 60% of financial close tasks. The system reduced close time from 12 days to 5.5 days. Implementation details available in Deloitte's technical case study with architecture diagrams and API specifications.</p>
      <div class="score">
        <strong>Score: 23/30</strong> | Relevance: 5 | Evidence Quality: 4 | Actionability: 3 | Novelty: 4 | Source Authority: 3 | Documentation Quality: 4
      </div>
      <p><a href="https://cfodive.com/..." style="color: #1B4332; text-decoration: none;">Read full article →</a></p>
    </div>

    <div class="finding high">
      <span class="badge high-badge">HIGH</span>
      <h3>OpenAI API Adds Enterprise Fine-Tuning</h3>
      <p class="source">OpenAI Blog • Feb 26, 2026</p>
      <p>OpenAI released enterprise fine-tuning capabilities for custom models. Available via API with full documentation and Python SDK support. Targets enterprise software teams building vertical AI solutions.</p>
      <div class="score">
        <strong>Score: 20/30</strong> | Relevance: 4 | Evidence Quality: 5 | Actionability: 5 | Novelty: 4 | Source Authority: 5 | Documentation Quality: 5
      </div>
      <p><a href="https://openai.com/..." style="color: #1B4332; text-decoration: none;">Read documentation →</a></p>
    </div>

    <h2>By Classification</h2>
    <ul>
      <li><strong>CRITICAL:</strong> 2 findings</li>
      <li><strong>HIGH:</strong> 3 findings</li>
    </ul>

    <h2>By Vertical</h2>
    <ul>
      <li>Finance & Accounting: 2</li>
      <li>Enterprise Software: 2</li>
      <li>Legal Tech: 1</li>
    </ul>

    <div class="footer">
      <p>AlioFoundry Intelligence Platform | Built in Cowork</p>
      <p><a href="#" style="color: #999; text-decoration: none;">View Full Dashboard</a> | <a href="#" style="color: #999; text-decoration: none;">Manage Preferences</a></p>
    </div>
  </div>
</body>
</html>
    `,
  };
}

/**
 * Generate weekly newsletter email
 */
function generateWeeklyNewsletter() {
  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay());
  const weekStr = weekOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    subject: `AlioFoundry Weekly Intelligence — Week of ${weekStr}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Calibri', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1B4332; color: white; padding: 20px; border-radius: 8px; }
    .header h1 { margin: 0; font-family: Georgia, serif; font-size: 32px; }
    .stat-box { display: inline-block; background: rgba(255,255,255,0.1); padding: 15px; margin: 5px; border-radius: 4px; }
    .stat-number { font-size: 24px; font-weight: bold; }
    .stat-label { font-size: 12px; }
    .section { margin: 30px 0; }
    .section h2 { color: #1B4332; font-family: Georgia, serif; border-bottom: 2px solid #1B4332; padding-bottom: 10px; }
    .vertical { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .vertical-name { font-weight: bold; color: #1B4332; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AlioFoundry Weekly Intelligence</h1>
      <p>Week of ${weekStr}, 2026</p>
      <div>
        <div class="stat-box">
          <div class="stat-number">15</div>
          <div class="stat-label">Findings</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">6</div>
          <div class="stat-label">CRITICAL</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">9</div>
          <div class="stat-label">HIGH</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Key Themes This Week</h2>
      <ul>
        <li><strong>Agentic AI in Finance:</strong> Multiple announcements of autonomous financial workflows (close automation, FP&A, audit)</li>
        <li><strong>Enterprise Fine-Tuning:</strong> Major LLM providers releasing custom model capabilities for vertical solutions</li>
        <li><strong>Supply Chain Optimization:</strong> AI-driven demand forecasting and inventory management solutions gaining traction</li>
      </ul>
    </div>

    <div class="section">
      <h2>Findings by Vertical</h2>

      <div class="vertical">
        <div class="vertical-name">Finance & Accounting</div>
        <p><strong>4 findings</strong> (2 CRITICAL, 2 HIGH)<br>
        Focus: Close automation, agentic workflows, CFO adoption of AI platforms</p>
      </div>

      <div class="vertical">
        <div class="vertical-name">Enterprise Software</div>
        <p><strong>3 findings</strong> (1 CRITICAL, 2 HIGH)<br>
        Focus: Platform announcements, developer tools, AI infrastructure</p>
      </div>

      <div class="vertical">
        <div class="vertical-name">Manufacturing & Distribution</div>
        <p><strong>3 findings</strong> (2 CRITICAL, 1 HIGH)<br>
        Focus: Supply chain AI, demand forecasting, inventory optimization</p>
      </div>

      <div class="vertical">
        <div class="vertical-name">Healthcare</div>
        <p><strong>2 findings</strong> (1 CRITICAL, 1 HIGH)<br>
        Focus: Clinical decision support, revenue cycle automation</p>
      </div>

      <div class="vertical">
        <div class="vertical-name">Legal Tech</div>
        <p><strong>2 findings</strong> (HIGH classification)<br>
        Focus: Contract AI, due diligence automation</p>
      </div>

      <div class="vertical">
        <div class="vertical-name">PE & M&A + Aerospace</div>
        <p><strong>1 finding each</strong><br>
        Focus: Deal sourcing AI, predictive maintenance</p>
      </div>
    </div>

    <div class="section">
      <h2>Avg Finding Score</h2>
      <p style="font-size: 32px; color: #1B4332; margin: 20px 0; font-weight: bold;">23.2 / 30</p>
      <p>High-quality findings with strong documentation and actionability.</p>
    </div>

    <div class="section">
      <h2>Next Week</h2>
      <p>Watch for: Q1 earnings calls from enterprise software vendors, potential announcements around AI regulation, new model releases from major labs.</p>
    </div>

    <div class="footer">
      <p>AlioFoundry Intelligence Platform | Built in Cowork</p>
      <p><a href="#" style="color: #999; text-decoration: none;">View Full Dashboard</a> | <a href="#" style="color: #999; text-decoration: none;">Subscribe to Weekly</a> | <a href="#" style="color: #999; text-decoration: none;">Manage Preferences</a></p>
    </div>
  </div>
</body>
</html>
    `,
  };
}

/**
 * Generate critical finding alert email
 */
function generateAlertEmail() {
  return {
    subject: '🚨 CRITICAL AlioFoundry Finding',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Calibri', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .alert { background: #d62828; color: white; padding: 20px; border-radius: 8px; }
    .alert h2 { margin: 0 0 10px 0; font-family: Georgia, serif; }
    .finding { background: white; padding: 20px; margin: 15px 0; border-left: 4px solid #d62828; }
    .finding h3 { color: #1B4332; margin: 0 0 8px 0; font-family: Georgia, serif; }
    .score { background: #f9f9f9; padding: 10px; border-radius: 4px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="alert">
      <h2>🚨 CRITICAL Finding Detected</h2>
      <p>A high-priority AI development requires your attention.</p>
    </div>

    <div class="finding">
      <h3>Enterprise AI Adoption Announcement</h3>
      <p><strong>Industry:</strong> Finance & Accounting<br>
      <strong>Source:</strong> CFO Dive (Primary)<br>
      <strong>Date:</strong> Today</p>

      <p>A Fortune 500 company has announced deployment of agentic AI for automated financial close. This represents a significant validation of the AI finance automation trend we've been tracking.</p>

      <div class="score">
        <strong>Score: 26/30 (CRITICAL)</strong><br>
        Documentation Quality: 5 | Evidence Quality: 5 | Source Authority: 5
      </div>

      <p><strong>Action Items:</strong></p>
      <ul>
        <li>Review full case study with implementation details</li>
        <li>Compare to competitive announcements</li>
        <li>Brief executive team on trend acceleration</li>
      </ul>

      <p><a href="#" style="color: #d62828; text-decoration: none; font-weight: bold;">View Full Finding →</a></p>
    </div>

    <p style="color: #999; font-size: 12px;">
      Alerts are sent for findings scoring CRITICAL (24-30 pts) with strong documentation quality.
      <a href="#" style="color: #999;">Manage alert preferences</a>
    </p>
  </div>
</body>
</html>
    `,
  };
}

export default handler;
