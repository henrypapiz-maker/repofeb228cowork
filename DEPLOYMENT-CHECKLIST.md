# AlioFoundry Deployment Checklist

**Status:** Ready for Production Deployment
**Last Updated:** February 28, 2026
**Estimated Time:** 3-4 hours for full deployment

---

## Phase 1: Database Setup (Neon PostgreSQL) — 45 minutes

### Prerequisites
- Neon account (free tier available at neon.tech)
- PostgreSQL client or Neon web interface

### Step 1.1: Create Neon Project
- [ ] Go to console.neon.tech
- [ ] Create new project named "aliofoundry"
- [ ] Select PostgreSQL version 15
- [ ] Copy `DATABASE_URL` from connection string

### Step 1.2: Run Schema SQL
- [ ] In Neon SQL Editor, run `neon_schema.sql` (creates 22 tables, 9 views, 10 indexes)
  - Tables: use_cases, articles, repositories, industries, findings, change_log, etc.
  - Views: use_case_summary, industry_metrics, finding_scorecard
  - Indexes: On industry_id, classification, total_score for fast queries

### Step 1.3: Seed Data (Optional)
- [ ] Run `neon_seed_data.sql` to populate with 505 initial rows
- [ ] Verify: `SELECT COUNT(*) FROM usecase.use_cases;` should return 248

### Step 1.4: Verification Query
```sql
-- Run all three to confirm setup
SELECT 'use_cases' as table_name, COUNT(*) as count FROM usecase.use_cases
UNION ALL
SELECT 'findings', COUNT(*) FROM usecase.findings
UNION ALL
SELECT 'articles', COUNT(*) FROM content.articles;
```

**Checklist:**
- [ ] Neon project created
- [ ] DATABASE_URL copied to secure location
- [ ] Schema tables created
- [ ] Seed data loaded (optional)
- [ ] Verification queries pass

---

## Phase 2: Environment Configuration (Vercel) — 30 minutes

### Step 2.1: Create Vercel Project
- [ ] Go to vercel.com
- [ ] Create new project linked to your GitHub repo (or create empty project)
- [ ] Project name: `aliofoundry`
- [ ] Framework preset: Node.js

### Step 2.2: Get Third-Party API Keys

#### Anthropic (Claude API)
- [ ] Visit console.anthropic.com
- [ ] Create new API key
- [ ] Copy key value (starts with `sk-ant-`)
- [ ] Save securely

#### Resend (Email Service)
- [ ] Go to resend.com
- [ ] Sign up for free account
- [ ] Create new API key
- [ ] Copy key value (starts with `re_`)
- [ ] Add DKIM/SPF records for your domain (or use default `resend.dev` domain)
- [ ] Note: If using custom domain, this adds 10-15 minutes

#### Generate Admin API Key
- [ ] Generate a random 32-character string (use `openssl rand -hex 16` or password generator)
- [ ] This is your internal authentication for triggering scans/orchestration

### Step 2.3: Set Vercel Environment Variables

In Vercel project settings → Environment Variables, add:

```
DATABASE_URL=postgresql://user:password@...neon.tech/neondb
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
ADMIN_API_KEY=<your-generated-key>
ADMIN_EMAIL=henry@aliofoundry.com
FROM_EMAIL=intelligence@aliofoundry.com
```

**Checklist:**
- [ ] Vercel project created
- [ ] Anthropic API key obtained
- [ ] Resend API key obtained and verified
- [ ] Admin API key generated
- [ ] All 6 environment variables set in Vercel

---

## Phase 3: Deploy API Endpoints (Vercel) — 45 minutes

### Step 3.1: Create `/api` Directory Structure
```
your-repo/
├── api/
│   ├── agent-scan.js       ✅ (created)
│   ├── orchestrate.js      ✅ (created)
│   └── notify.js           ✅ (created)
├── public/
│   └── dashboard.html      (your React component as static export)
└── vercel.json             (configuration file)
```

### Step 3.2: Create `vercel.json` Configuration
- [ ] Create `vercel.json` in project root:

```json
{
  "functions": {
    "api/**/*.js": {
      "runtime": "nodejs18.x",
      "memory": 3008,
      "maxDuration": 300
    }
  },
  "crons": [
    {
      "path": "/api/agent-scan?key=${ADMIN_API_KEY}",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/orchestrate?action=notify&subtype=daily&key=${ADMIN_API_KEY}",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/orchestrate?action=notify&subtype=weekly&key=${ADMIN_API_KEY}",
      "schedule": "0 8 * * 5"
    }
  ]
}
```

### Step 3.3: Deploy to Vercel
- [ ] Push code to GitHub (or upload directly to Vercel)
- [ ] Vercel automatically deploys
- [ ] Wait for deployment to complete (2-3 minutes)
- [ ] Note: Your domain will be `aliofoundry.vercel.app` (or custom domain if configured)

### Step 3.4: Test API Endpoints

#### Test 1: Health Check
```bash
curl https://aliofoundry.vercel.app/api/orchestrate?action=status
```
Expected: `{"status": "healthy", ...}`

#### Test 2: Validate Findings
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -d '{"findings":[{"source_url":"https://example.com","source_name":"Test","title":"Test Finding","date":"2026-02-28","industry_id":1,"category":"Test","scores":{"relevance":5,"evidence_quality":5,"actionability":5,"novelty":5,"source_authority":5,"documentation_quality":5},"total_score":30,"classification":"CRITICAL","summary":"This is a test finding that meets all requirements and demonstrates the full workflow from discovery through validation.","key_stats":["stat1","stat2"],"tools_mentioned":["tool1"],"documentation_links":["https://github.com/example"],"action":"add_to_industry_scan"}]}' \
  https://aliofoundry.vercel.app/api/orchestrate?action=validate
```
Expected: `{"validation_result": "PASS", "valid": 1, "invalid": 0}`

#### Test 3: Manual Agent Scan (Optional)
```bash
curl -X POST -H "x-api-key: YOUR_ADMIN_API_KEY" \
  https://aliofoundry.vercel.app/api/agent-scan
```
Expected: Returns 5-15 findings with scores

**Checklist:**
- [ ] API files deployed
- [ ] `vercel.json` created with cron jobs
- [ ] Code pushed to Vercel
- [ ] Deployment successful
- [ ] Health check passes
- [ ] Validation endpoint works
- [ ] Agent scan endpoint responds (even if test data)

---

## Phase 4: Database Integration (Connect API to Neon) — 30 minutes

### Step 4.1: Update `api/orchestrate.js`
- [ ] Uncomment/implement `handleIngest()` function
- [ ] Add PostgreSQL connection using `@neondatabase/serverless`:

```javascript
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function handleIngest(req, res) {
  const { findings } = req.body || {};

  try {
    // Insert each finding into database
    for (const finding of findings) {
      await sql`
        INSERT INTO usecase.findings (
          source_url, source_name, title, date, industry_id, category,
          summary, scores, total_score, classification, key_stats,
          tools_mentioned, documentation_links, action, status, week_added
        ) VALUES (
          ${finding.source_url}, ${finding.source_name}, ${finding.title},
          ${finding.date}, ${finding.industry_id}, ${finding.category},
          ${finding.summary}, ${JSON.stringify(finding.scores)},
          ${finding.total_score}, ${finding.classification},
          ${finding.key_stats}, ${finding.tools_mentioned},
          ${finding.documentation_links}, ${finding.action},
          'Agent-Scanned', ${new Date().toISOString().split('T')[0]}
        );
    }

    return res.status(200).json({
      success: true,
      ingested_count: findings.length
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
```

### Step 4.2: Update `api/orchestrate.js` - Data Extract
- [ ] Implement `handleExtract()` to pull real data from database:

```javascript
async function handleExtract(req, res) {
  const sql = neon(process.env.DATABASE_URL);

  try {
    const useCase = await sql`
      SELECT COUNT(*) as total, classification, industry_id
      FROM usecase.findings
      GROUP BY classification, industry_id;
    `;

    // Return real data
    return res.status(200).json({ use_cases: useCase });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
```

### Step 4.3: Install Dependencies
- [ ] Update `package.json` with:
```json
{
  "dependencies": {
    "@neondatabase/serverless": "latest"
  }
}
```

### Step 4.4: Test Database Connection
```bash
curl -X POST -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"findings":[{"source_url":"https://test.com",...}]}' \
  https://aliofoundry.vercel.app/api/orchestrate?action=ingest
```

**Checklist:**
- [ ] `@neondatabase/serverless` installed
- [ ] `handleIngest()` implemented with SQL inserts
- [ ] `handleExtract()` implemented with real queries
- [ ] Database connection tested
- [ ] Test data successfully inserted into Neon

---

## Phase 5: Email Configuration (Resend) — 15 minutes

### Step 5.1: Configure Domain (Optional but Recommended)
- [ ] In Resend dashboard, add custom domain
- [ ] Add DKIM & SPF records to your domain DNS:
  - DKIM: `_resend._domainkey.yourdomain.com`
  - SPF: Add Resend's SPF value to existing SPF record
- [ ] Verify domain (usually takes 5-10 minutes)

### Step 5.2: Test Email Send
```bash
curl -X POST \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  https://aliofoundry.vercel.app/api/notify?type=daily
```
Check your inbox for test email

### Step 5.3: Verify Email Templates
- [ ] Daily digest email renders correctly
- [ ] Weekly newsletter email renders correctly
- [ ] Alert email renders correctly
- [ ] Links are clickable
- [ ] Branding (colors, fonts) matches AlioFoundry style

**Checklist:**
- [ ] Resend domain configured (or using resend.dev)
- [ ] Test emails sent successfully
- [ ] Emails arrive in inbox (check spam folder too)
- [ ] Email templates look professional
- [ ] All three email types working (daily, weekly, alert)

---

## Phase 6: Schedule Configuration (Vercel Crons) — 10 minutes

### Step 6.1: Verify Cron Jobs in Vercel
- [ ] Go to Vercel project settings
- [ ] Find "Cron Jobs" section
- [ ] Confirm 3 crons are registered:
  - Agent scan: 0 2 * * * (2:00 AM daily)
  - Daily notify: 0 3 * * * (3:00 AM daily)
  - Weekly notify: 0 8 * * 5 (8:00 AM Friday)

### Step 6.2: Monitor Cron Execution
- [ ] Check Vercel logs for successful runs
- [ ] Confirm findings are being saved to database
- [ ] Verify emails are being sent

### Step 6.3: Set Timezone
- [ ] Verify Vercel timezone setting is UTC (cron times are UTC)
- [ ] If you're in Central Time, 2 AM Central = 8 AM UTC
- [ ] Adjust cron times if needed:
  - 2 AM Central = `0 8 * * *` (UTC)
  - 3 AM Central = `0 9 * * *` (UTC)

**Checklist:**
- [ ] Vercel crons registered
- [ ] Cron execution logs visible
- [ ] Timezone confirmed
- [ ] Cron times adjusted for UTC if needed
- [ ] First scan runs successfully

---

## Phase 7: Dashboard Integration (Final) — 30 minutes

### Step 7.1: Update Dashboard to Use Live Data
- [ ] Modify `AlioFoundry_Dashboard.jsx`:
```javascript
// Replace REAL_DATA fetch with API call
const [data, setData] = useState({});

useEffect(() => {
  fetch('/api/orchestrate?action=extract')
    .then(r => r.json())
    .then(d => setData(d));
}, []);
```

### Step 7.2: Wire Approve/Reject Buttons
- [ ] Create endpoint to update finding status in database:
```javascript
// POST /api/orchestrate?action=update&finding_id=123&status=approved
```

### Step 7.3: Deploy Updated Dashboard
- [ ] Deploy React component changes to Vercel
- [ ] Test live data loading in dashboard
- [ ] Verify real findings appear in Findings tab
- [ ] Test approve/reject workflow

**Checklist:**
- [ ] Dashboard calls API for live data
- [ ] Approve/reject buttons implemented
- [ ] Real data from database displays in dashboard
- [ ] Charts update with live data
- [ ] All tabs functional

---

## Phase 8: Monitoring & Maintenance — Ongoing

### Daily Tasks
- [ ] Check dashboard for new findings
- [ ] Review email notifications
- [ ] Spot-check finding quality (are scores accurate?)

### Weekly Tasks
- [ ] Review weekly newsletter template
- [ ] Check database growth (should add 70-150 findings/week)
- [ ] Adjust scoring weights if needed based on feedback

### Monthly Tasks
- [ ] Review Vercel usage/costs
- [ ] Check Neon database growth
- [ ] Analyze classification distribution
- [ ] Plan vertical expansion or source additions

### Monitoring URLs
- **Dashboard:** https://aliofoundry.vercel.app
- **Health Check:** https://aliofoundry.vercel.app/api/orchestrate?action=status
- **Vercel Logs:** https://vercel.com/your-org/aliofoundry/logs
- **Neon Console:** https://console.neon.tech

---

## Troubleshooting

### Problem: Agent scan returns no findings
**Solution:**
- [ ] Check `ANTHROPIC_API_KEY` is valid
- [ ] Verify Claude API is working: `curl https://api.anthropic.com/v1/messages`
- [ ] Review Anthropic API documentation for rate limits
- [ ] Check Vercel function logs for errors

### Problem: Database insert fails
**Solution:**
- [ ] Verify `DATABASE_URL` is correct
- [ ] Check schema exists in Neon: `SELECT * FROM information_schema.tables;`
- [ ] Verify finding JSON matches schema fields
- [ ] Check for NOT NULL constraint violations

### Problem: Emails not sending
**Solution:**
- [ ] Verify `RESEND_API_KEY` is valid
- [ ] Check domain verification in Resend
- [ ] Review Resend API logs for error details
- [ ] Try test email: `curl https://aliofoundry.vercel.app/api/notify?type=daily`

### Problem: Cron jobs not executing
**Solution:**
- [ ] Verify `vercel.json` syntax is valid
- [ ] Check Vercel cron logs for failures
- [ ] Verify API key matches `ADMIN_API_KEY` in URL
- [ ] Check function timeout settings (300 seconds recommended)

---

## Success Criteria ✅

You'll know deployment is complete when:

- [ ] **Layer 1 (Dashboard):** React component displays real data from database
- [ ] **Layer 2 (Skill):** Cowork skill runs and produces structured JSON
- [ ] **Layer 3 (Scheduled Task):** Daily scan runs automatically at 2 AM
- [ ] **Layer 4 (Orchestrator):** Findings validated, transformed, saved to DB
- [ ] **Layer 5 (Vercel):** API endpoints live, crons executing, emails sending
- [ ] **Database:** 100+ findings in system, organized by industry
- [ ] **Email:** Daily digest and weekly newsletter arriving successfully
- [ ] **Monitoring:** Vercel logs show healthy execution

---

## Next Steps (Post-Deployment)

1. **Expand Sources** — Add more Tier 1 sources to improve coverage
2. **Vertical-Specific Tuning** — Adjust scoring weights per vertical
3. **Subscriber System** — Build customer-facing newsletter subscription
4. **Reporting** — Add analytics dashboard showing trends over time
5. **API Access** — Expose findings via public API for partners
6. **Competitive Intelligence** — Track competitor AI moves automatically

---

**Questions?**

- Review `COWORK-GUIDE.md` for architecture overview
- Check `orchestrator.py` for validation logic
- Review `alioFoundry-agent-SKILL.md` for scoring rubric
- Contact: henry@aliofoundry.com

**Built in Cowork** — February 28, 2026
