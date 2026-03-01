/**
 * AlioFoundry Email Notification Endpoint
 * GET/POST /api/notify
 *
 * Queries live findings from Neon DB and sends formatted emails via Resend.
 *
 * Query params:
 *   - type: daily|weekly|alert (default: daily)
 *   - recipient: Email override (default: ADMIN_EMAIL)
 *
 * Auth: Requires x-api-key header or ?key= query param matching ADMIN_API_KEY
 */

import { neon } from '@neondatabase/serverless';

const handler = async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const emailType = req.query.type || 'daily';
  const recipient = req.query.recipient || process.env.ADMIN_EMAIL;

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: 'RESEND_API_KEY not configured' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: 'DATABASE_URL not configured' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    let emailContent;

    switch (emailType) {
      case 'daily':
        emailContent = await generateDailyDigest(sql);
        break;
      case 'weekly':
        emailContent = await generateWeeklyNewsletter(sql);
        break;
      case 'alert':
        emailContent = await generateAlertEmail(sql);
        break;
      default:
        return res.status(400).json({ error: 'Invalid type', valid_types: ['daily', 'weekly', 'alert'] });
    }

    // Send via Resend API
    const sendResult = await sendEmail({
      to: recipient,
      from: process.env.FROM_EMAIL || 'intelligence@aliofoundry.com',
      subject: emailContent.subject,
      html: emailContent.html,
    });

    // Log delivery
    try {
      await sql`
        INSERT INTO operations.email_deliveries (subscriber_email, email_type, sent_at, status)
        VALUES (${recipient}, ${emailType}, NOW(), 'sent')
      `;
    } catch (logErr) {
      console.error('Email delivery log error:', logErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `${emailType} notification sent`,
      type: emailType,
      recipient,
      timestamp: new Date().toISOString(),
      email_id: sendResult.id || 'unknown',
    });
  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: 'Email send failed', message: error.message });
  }
};

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
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Resend API error: ${error.message}`);
  }

  return await response.json();
}

// ─── DAILY DIGEST ───

async function generateDailyDigest(sql) {
  const today = new Date().toISOString().split('T')[0];
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Get today's findings (or most recent)
  const findings = await sql`
    SELECT f.*, i.name AS industry_name
    FROM usecase.findings f
    LEFT JOIN usecase.industries i ON f.industry_id = i.industry_id
    WHERE f.date >= CURRENT_DATE - INTERVAL '1 day'
    ORDER BY f.total_score DESC
    LIMIT 10
  `;

  // Get counts by classification
  const counts = await sql`
    SELECT classification, COUNT(*) AS cnt
    FROM usecase.findings
    WHERE date >= CURRENT_DATE - INTERVAL '1 day'
    GROUP BY classification
  `;

  // Get counts by industry
  const bySector = await sql`
    SELECT i.name, COUNT(*) AS cnt
    FROM usecase.findings f
    JOIN usecase.industries i ON f.industry_id = i.industry_id
    WHERE f.date >= CURRENT_DATE - INTERVAL '1 day'
    GROUP BY i.name
    ORDER BY cnt DESC
  `;

  const classMap = {};
  counts.forEach(r => { classMap[r.classification] = parseInt(r.cnt); });

  const findingsHtml = findings.length > 0
    ? findings.map(f => {
        const badgeClass = f.classification === 'CRITICAL' ? 'critical' : f.classification === 'HIGH' ? 'high' : 'standard';
        const badgeBg = f.classification === 'CRITICAL' ? '#d62828' : f.classification === 'HIGH' ? '#f77f00' : '#2E7D32';
        return `
        <div style="border-left: 4px solid ${badgeBg}; padding: 15px; margin: 15px 0; background: #f9f9f9;">
          <span style="display:inline-block; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:bold; background:${badgeBg}; color:white; margin-right:8px;">${f.classification}</span>
          <span style="font-size:12px; color:#666;">${f.industry_name}</span>
          <h3 style="margin: 8px 0 4px 0; font-family: Georgia, serif; color: #1B4332;">${f.title}</h3>
          <div style="font-size:12px; color:#666; margin-bottom:6px;">${f.source_name} | ${f.date}</div>
          <p style="font-size:14px; color:#333; line-height:1.5; margin:0;">${f.summary}</p>
          <div style="margin-top:8px; font-size:13px;"><strong>Score: ${f.total_score}/30</strong></div>
        </div>`;
      }).join('')
    : '<p style="color:#999;">No new findings in the last 24 hours. The next scan runs at 8am UTC.</p>';

  const sectorHtml = bySector.map(s => `<li>${s.name}: ${s.cnt}</li>`).join('');

  return {
    subject: `AlioFoundry Daily Intelligence - ${dateStr}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Calibri,sans-serif; line-height:1.6; color:#333; margin:0; padding:0;">
<div style="max-width:600px; margin:0 auto; padding:20px;">
  <div style="background:#1B4332; color:white; padding:20px; border-radius:8px;">
    <h1 style="margin:0; font-family:Georgia,serif; font-size:24px;">AlioFoundry Intelligence</h1>
    <p style="margin:4px 0 0; opacity:0.8;">Daily Digest - ${dateStr}</p>
  </div>

  <h2 style="color:#1B4332; font-family:Georgia,serif; margin-top:24px;">Today's Findings</h2>
  <p>${findings.length} new findings detected. ${classMap['CRITICAL'] || 0} CRITICAL, ${classMap['HIGH'] || 0} HIGH, ${classMap['STANDARD'] || 0} STANDARD.</p>

  ${findingsHtml}

  ${bySector.length > 0 ? `<h2 style="color:#1B4332; font-family:Georgia,serif;">By Vertical</h2><ul>${sectorHtml}</ul>` : ''}

  <div style="margin-top:30px; padding-top:20px; border-top:1px solid #ddd; text-align:center; color:#999; font-size:12px;">
    <p>AlioFoundry Intelligence Platform | <a href="https://aliofoundry.vercel.app" style="color:#1B4332;">View Dashboard</a></p>
  </div>
</div></body></html>`,
  };
}

// ─── WEEKLY NEWSLETTER ───

async function generateWeeklyNewsletter(sql) {
  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay());
  const weekStr = weekOf.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Get this week's findings
  const findings = await sql`
    SELECT f.*, i.name AS industry_name
    FROM usecase.findings f
    LEFT JOIN usecase.industries i ON f.industry_id = i.industry_id
    WHERE f.date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY f.total_score DESC
  `;

  // Get summary stats
  const summary = await sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN classification = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN classification = 'HIGH' THEN 1 ELSE 0 END) AS high,
      SUM(CASE WHEN classification = 'STANDARD' THEN 1 ELSE 0 END) AS standard,
      ROUND(AVG(total_score)::numeric, 1) AS avg_score
    FROM usecase.findings
    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
  `;

  // Get by industry
  const bySector = await sql`
    SELECT i.name, COUNT(*) AS cnt,
      SUM(CASE WHEN f.classification = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN f.classification = 'HIGH' THEN 1 ELSE 0 END) AS high,
      ROUND(AVG(f.total_score)::numeric, 1) AS avg_score
    FROM usecase.findings f
    JOIN usecase.industries i ON f.industry_id = i.industry_id
    WHERE f.date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY i.name
    ORDER BY cnt DESC
  `;

  // Get scan history
  const scans = await sql`
    SELECT scan_date, findings_count, critical_count, high_count, avg_score
    FROM operations.scan_runs
    WHERE scan_date >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY scan_date DESC
  `;

  const s = summary[0] || { total: 0, critical: 0, high: 0, standard: 0, avg_score: 0 };

  const topFindings = findings.slice(0, 5).map(f => {
    const badgeBg = f.classification === 'CRITICAL' ? '#d62828' : f.classification === 'HIGH' ? '#f77f00' : '#2E7D32';
    return `
    <div style="border-left:4px solid ${badgeBg}; padding:12px; margin:10px 0; background:#f9f9f9;">
      <span style="display:inline-block; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; background:${badgeBg}; color:white;">${f.classification}</span>
      <span style="font-size:12px; color:#666; margin-left:6px;">${f.industry_name}</span>
      <div style="font-weight:700; font-size:14px; color:#1B4332; margin-top:6px;">${f.title}</div>
      <div style="font-size:13px; color:#333; margin-top:4px;">${f.summary?.substring(0, 200)}${f.summary?.length > 200 ? '...' : ''}</div>
      <div style="font-size:12px; color:#666; margin-top:4px;">Score: ${f.total_score}/30 | ${f.source_name}</div>
    </div>`;
  }).join('');

  const sectorRows = bySector.map(s => `
    <div style="background:#f9f9f9; padding:12px; margin:8px 0; border-radius:4px;">
      <div style="font-weight:700; color:#1B4332;">${s.name}</div>
      <div style="font-size:13px; color:#666;">${s.cnt} findings (${s.critical} CRITICAL, ${s.high} HIGH) | Avg score: ${s.avg_score}/30</div>
    </div>
  `).join('');

  return {
    subject: `AlioFoundry Weekly Intelligence - Week of ${weekStr}`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Calibri,sans-serif; line-height:1.6; color:#333; margin:0; padding:0;">
<div style="max-width:600px; margin:0 auto; padding:20px;">
  <div style="background:#1B4332; color:white; padding:20px; border-radius:8px;">
    <h1 style="margin:0; font-family:Georgia,serif; font-size:28px;">AlioFoundry Weekly Intelligence</h1>
    <p style="margin:4px 0 0; opacity:0.8;">Week of ${weekStr}, 2026</p>
    <div style="display:flex; gap:16px; margin-top:14px;">
      <div style="text-align:center; background:rgba(255,255,255,0.1); padding:10px 16px; border-radius:4px;">
        <div style="font-size:22px; font-weight:700;">${s.total}</div><div style="font-size:11px; opacity:0.7;">FINDINGS</div>
      </div>
      <div style="text-align:center; background:rgba(255,255,255,0.1); padding:10px 16px; border-radius:4px;">
        <div style="font-size:22px; font-weight:700;">${s.critical}</div><div style="font-size:11px; opacity:0.7;">CRITICAL</div>
      </div>
      <div style="text-align:center; background:rgba(255,255,255,0.1); padding:10px 16px; border-radius:4px;">
        <div style="font-size:22px; font-weight:700;">${s.avg_score}</div><div style="font-size:11px; opacity:0.7;">AVG SCORE</div>
      </div>
    </div>
  </div>

  <h2 style="color:#1B4332; font-family:Georgia,serif; margin-top:24px;">Top Findings This Week</h2>
  ${topFindings || '<p style="color:#999;">No findings this week.</p>'}

  <h2 style="color:#1B4332; font-family:Georgia,serif;">By Vertical</h2>
  ${sectorRows || '<p style="color:#999;">No industry data.</p>'}

  ${scans.length > 0 ? `
  <h2 style="color:#1B4332; font-family:Georgia,serif;">Scan Activity</h2>
  <table style="width:100%; border-collapse:collapse; font-size:13px;">
    <tr style="background:#E8F5E9;"><th style="padding:8px; text-align:left;">Date</th><th>Findings</th><th>Critical</th><th>Avg Score</th></tr>
    ${scans.map(sc => `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">${sc.scan_date}</td><td style="text-align:center;">${sc.findings_count}</td><td style="text-align:center; color:#d62828; font-weight:600;">${sc.critical_count}</td><td style="text-align:center;">${sc.avg_score}</td></tr>`).join('')}
  </table>` : ''}

  <div style="margin-top:30px; padding-top:20px; border-top:1px solid #ddd; text-align:center; color:#999; font-size:12px;">
    <p>AlioFoundry Intelligence Platform | <a href="https://aliofoundry.vercel.app" style="color:#1B4332;">View Dashboard</a></p>
  </div>
</div></body></html>`,
  };
}

// ─── CRITICAL ALERT ───

async function generateAlertEmail(sql) {
  // Get most recent CRITICAL finding
  const criticals = await sql`
    SELECT f.*, i.name AS industry_name
    FROM usecase.findings f
    LEFT JOIN usecase.industries i ON f.industry_id = i.industry_id
    WHERE f.classification = 'CRITICAL'
    ORDER BY f.created_at DESC
    LIMIT 3
  `;

  const alertItems = criticals.length > 0
    ? criticals.map(f => `
      <div style="background:white; padding:20px; margin:15px 0; border-left:4px solid #d62828;">
        <h3 style="color:#1B4332; margin:0 0 8px; font-family:Georgia,serif;">${f.title}</h3>
        <p style="font-size:13px; color:#666;"><strong>Industry:</strong> ${f.industry_name} | <strong>Source:</strong> ${f.source_name} | <strong>Date:</strong> ${f.date}</p>
        <p style="font-size:14px; color:#333; line-height:1.5;">${f.summary}</p>
        <div style="background:#f9f9f9; padding:10px; border-radius:4px; margin-top:8px;">
          <strong>Score: ${f.total_score}/30 (CRITICAL)</strong>
        </div>
      </div>
    `).join('')
    : '<p style="color:#999;">No critical findings at this time.</p>';

  return {
    subject: `CRITICAL AlioFoundry Finding${criticals.length > 1 ? 's' : ''} Detected`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Calibri,sans-serif; line-height:1.6; color:#333; margin:0; padding:0;">
<div style="max-width:600px; margin:0 auto; padding:20px;">
  <div style="background:#d62828; color:white; padding:20px; border-radius:8px;">
    <h2 style="margin:0; font-family:Georgia,serif;">CRITICAL Finding${criticals.length > 1 ? 's' : ''} Detected</h2>
    <p style="margin:4px 0 0; opacity:0.9;">${criticals.length} high-priority development${criticals.length > 1 ? 's' : ''} requiring attention.</p>
  </div>
  ${alertItems}
  <div style="margin-top:30px; padding-top:20px; border-top:1px solid #ddd; text-align:center; color:#999; font-size:12px;">
    <p>AlioFoundry Intelligence Platform | <a href="https://aliofoundry.vercel.app" style="color:#1B4332;">View Dashboard</a></p>
  </div>
</div></body></html>`,
  };
}

export default handler;
