# Neon Database Setup for AlioFoundry

**Status:** Ready to Deploy
**Database Type:** PostgreSQL 15 (Neon)
**Schema:** Complete with tables, views, triggers, indexes
**Estimated Setup Time:** 20 minutes

---

## Overview

You're creating a **fresh, clean Neon database** for AlioFoundry findings. Subscribers remain in their existing database (separate system).

### Architecture
```
New Neon DB (AlioFoundry)
├── usecase schema
│   ├── findings (main table - 6-dimensional scores)
│   └── industries (lookup table)
├── content schema
│   ├── use_cases
│   ├── articles
│   └── repositories
└── operations schema
    ├── change_log (audit trail)
    ├── scan_runs (scan history)
    ├── approvals (editorial review)
    └── email_deliveries (tracking)

External DB (Your Current System)
├── subscribers
├── subscriptions
└── other tables...
```

---

## Step-by-Step Setup

### Phase 1: Create Neon Project (5 minutes)

1. Go to **console.neon.tech**
2. Sign up or log in
3. Click **"New Project"**
4. Configure:
   - **Name:** `aliofoundry`
   - **Region:** Pick one close to you (US-East recommended)
   - **PostgreSQL Version:** 15 (recommended)
5. Click **Create Project**
6. Wait for project to initialize (~30 seconds)

### Phase 2: Get Connection String (2 minutes)

1. In Neon console, go to **Connection String**
2. Copy the **PostgreSQL Connection String**
3. It will look like:
   ```
   postgresql://user:password@ep-xxxxx.neon.tech/neondb?sslmode=require
   ```
4. Save this as your `DATABASE_URL` (you'll need it for Vercel)

### Phase 3: Run Schema SQL (5 minutes)

**Option A: Using Neon SQL Editor (Easiest)**

1. In Neon console, click **"SQL Editor"**
2. Open file: `schema_aliofoundry_complete.sql`
3. Copy all SQL
4. Paste into Neon SQL Editor
5. Click **"Execute"**
6. Wait for completion (should see green checkmarks)

**Option B: Using psql (Command Line)**

```bash
psql "postgresql://user:password@ep-xxxxx.neon.tech/neondb?sslmode=require" \
  -f schema_aliofoundry_complete.sql
```

### Phase 4: Verify Schema (3 minutes)

Run these verification queries in Neon SQL Editor:

**Query 1: Count tables**
```sql
SELECT COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema IN ('usecase', 'content', 'operations');
```
Expected result: **10 tables**

**Query 2: Check industries**
```sql
SELECT * FROM usecase.industries;
```
Expected result: **7 industries** (Finance, PE, Legal, Manufacturing, Software, Healthcare, Aerospace)

**Query 3: Check views**
```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema IN ('usecase', 'content', 'operations');
```
Expected result: **5 views** (findings_summary, industry_breakdown, etc.)

**Query 4: Test insert (optional)**
```sql
INSERT INTO usecase.findings (
  source_url, source_name, title, date, industry_id, category,
  summary, relevance_score, evidence_quality_score, actionability_score,
  novelty_score, source_authority_score, documentation_quality_score,
  total_score, classification, week_added
) VALUES (
  'https://example.com/test',
  'Test Source',
  'Test Finding',
  CURRENT_DATE,
  1,
  'Test Category',
  'This is a test finding to verify the database is working correctly and accepting data.',
  5, 5, 5, 5, 5, 5,
  30,
  'CRITICAL',
  CURRENT_DATE
);

SELECT * FROM usecase.findings LIMIT 1;
```
Expected result: **1 row inserted and retrieved**

---

## Database Schema Overview

### Core Tables

**usecase.findings** (Main findings table)
- 23 columns
- 6-dimensional scores (1-5 each)
- Total score 5-30
- Classification (CRITICAL/HIGH/STANDARD/LOW/SKIP)
- Full audit trail with updated_at

**usecase.industries**
- 7 rows (one per vertical)
- Reference data with key signals and sub-sectors

**content.use_cases, articles, repositories**
- Supporting content tables
- Cross-reference to industries

**operations.*** (Audit & Operations)
- change_log (audit trail)
- scan_runs (daily scan history)
- approvals (editorial review)
- email_deliveries (external subscriber tracking)

### Indexes (10 total)

Fast querying on:
- Finding date, classification, industry, score, status
- Scan history and email delivery tracking
- Change log lookups

### Views (5 total)

1. **findings_with_industry** — Findings + industry names
2. **findings_summary** — Overall statistics
3. **industry_breakdown** — Findings per industry
4. **inventory** — Content type counts
5. **documentation_quality_metrics** — Doc quality distribution

### Triggers (6 total)

1. Auto-update `updated_at` timestamp on changes
2. Auto-log all changes to `change_log` table for audit trail

---

## Important Configuration

### For Email Delivery to External Subscribers

Since subscribers are in a **different database**, the email endpoint needs to:

1. **Write to email_deliveries table** (Neon)
   ```sql
   INSERT INTO operations.email_deliveries (
     finding_id, subscriber_email, email_type, sent_at, status
   ) VALUES (...)
   ```

2. **Query subscriber list from external database** (Your DB)
   ```javascript
   // In api/notify.js:
   // Connect to external DB using its connection string
   const externalSubscribers = await queryExternalDB(
     `SELECT email FROM subscribers WHERE status = 'active'`
   );
   ```

3. **Send emails via Resend API** to external subscriber list

**You'll need:**
- Connection string to your external subscriber database
- Query to get active subscriber emails
- Environment variable: `EXTERNAL_SUBSCRIBER_DB_URL`

---

## Connection Strings for .env

**Neon (AlioFoundry):**
```
DATABASE_URL=postgresql://user:password@ep-xxxxx.neon.tech/neondb?sslmode=require
```

**External (Subscribers):**
```
EXTERNAL_SUBSCRIBER_DB_URL=postgresql://user:password@your-server.com/database?sslmode=require
```

Or if subscribers are in different system (MySQL, CSV, API):
```
SUBSCRIBER_API_KEY=your-api-key
SUBSCRIBER_API_ENDPOINT=https://subscribers.yourcompany.com/api/active
```

---

## Database Limits & Scaling

**Neon Free Tier:**
- ✅ Unlimited queries
- ✅ 3 GB storage
- ✅ Full PostgreSQL features
- Perfect for 5,000-10,000 findings/month

**If you exceed free tier:**
- Pro plan: $19/month (100GB storage, priority support)
- Auto-scales beyond that

**Expected usage:**
- ~5-15 findings/day
- ~70-150 findings/week
- ~280-600 findings/month
- ~3-7 MB/month storage
- **Free tier is sufficient for 1+ year**

---

## Daily Operations Queries

Once deployed, you'll use these queries regularly:

**Get today's findings:**
```sql
SELECT title, classification, total_score, industry_id
FROM usecase.findings
WHERE week_added = CURRENT_DATE
ORDER BY total_score DESC;
```

**Get CRITICAL findings from last 7 days:**
```sql
SELECT title, source_name, total_score, documentation_quality_score
FROM usecase.findings
WHERE classification = 'CRITICAL'
  AND week_added >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY total_score DESC;
```

**Get industry breakdown:**
```sql
SELECT * FROM usecase.industry_breakdown;
```

**Check scan history:**
```sql
SELECT scan_date, findings_count, critical_count, high_count, avg_score
FROM operations.scan_runs
ORDER BY scan_date DESC
LIMIT 30;
```

**Get email delivery status:**
```sql
SELECT email_type, status, COUNT(*) as count
FROM operations.email_deliveries
WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY email_type, status;
```

---

## Troubleshooting

### "Connection refused"
- Verify `DATABASE_URL` is correct
- Check you're using **PostgreSQL** format, not MYSQL
- Verify Neon project is running (should show green checkmark)

### "Table doesn't exist"
- Run schema SQL again in full
- Verify tables exist: `SELECT * FROM information_schema.tables WHERE table_schema = 'usecase';`
- Check for SQL errors in output

### "Permission denied"
- Verify you're using correct user credentials
- Run from Neon SQL Editor (web interface) if CLI fails

### "Constraint violation on insert"
- Verify total_score = sum of 6 individual scores
- Verify classification matches score range:
  - CRITICAL: 24-30
  - HIGH: 18-23
  - STANDARD: 12-17
  - LOW: 6-11
  - SKIP: <6

---

## Next Steps

1. ✅ Create Neon project
2. ✅ Run schema SQL
3. ✅ Verify with test queries
4. **→ Configure DATABASE_URL in Vercel**
5. **→ Get EXTERNAL_SUBSCRIBER_DB_URL**
6. **→ Update api/orchestrate.js to connect to external DB for emails**

---

## Files Related to This Setup

- `schema_aliofoundry_complete.sql` — Full database schema (this file's SQL)
- `DEPLOYMENT-CHECKLIST.md` — Phase 1 covers this setup
- `api/orchestrate.js` — Uses DATABASE_URL
- `api/agent-scan.js` — Writes findings to this database
- `api/notify.js` — Queries external subscriber DB

---

**Questions?**

- Neon docs: https://neon.tech/docs
- PostgreSQL docs: https://www.postgresql.org/docs/15/
- Schema file: `schema_aliofoundry_complete.sql`

You now have a clean, production-ready database. Let's move on to Vercel deployment!
