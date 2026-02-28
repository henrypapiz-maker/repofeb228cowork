# AlioFoundry Database

Complete Neon PostgreSQL schema and initialization scripts for AlioFoundry Intelligence Platform.

---

## Quick Start

### 1. Set up Neon database (15 minutes)

```bash
# Set your Neon connection string
export DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require"

# Run initialization script
./scripts/init-neon.sh
```

### 2. Verify setup (5 minutes)

```bash
# Run verification queries
psql "$DATABASE_URL" -f schema/verify.sql
```

Expected output:
- 10 tables created ✓
- 5 views created ✓
- 7 industries loaded ✓
- All indexes in place ✓

---

## Directory Structure

```
db/
├── README.md                          ← This file
├── schema/
│   ├── aliofoundry.sql                ← Main schema (424 lines)
│   └── verify.sql                     ← Verification queries
├── scripts/
│   ├── init-neon.sh                   ← Initialization script
│   └── [other scripts]
└── seed/
    └── initial-data.sql               ← Optional seed data
```

---

## Schema Overview

### Three Schemas

**usecase** - Core intelligence data
- `findings` - Main table (findings from agent scans)
- `industries` - Lookup table (7 industry verticals)

**content** - Supporting content
- `use_cases` - Use case descriptions
- `articles` - Article references
- `repositories` - Code repository references

**operations** - Operational tracking
- `change_log` - Audit trail
- `scan_runs` - Daily scan history
- `approvals` - Editorial review status
- `email_deliveries` - Email delivery tracking

### Key Tables

**findings** (Main table)
- 23 columns including 6-dimensional scoring
- Scores: relevance, evidence_quality, actionability, novelty, source_authority, documentation_quality
- Total score: 5-30 points
- Classification: CRITICAL | HIGH | STANDARD | LOW | SKIP
- Full audit trail with `updated_at` timestamp

**industries**
- 7 rows (one per vertical)
- Finance, PE, Legal, Manufacturing, Enterprise Software, Healthcare, Aerospace

### Views

- `findings_with_industry` - Findings with industry names
- `findings_summary` - Overall statistics (count, avg score, etc.)
- `industry_breakdown` - Findings per vertical
- `inventory` - Content type counts
- `documentation_quality_metrics` - Doc quality distribution

### Triggers

1. Auto-update `updated_at` on all tables
2. Auto-log all changes to `change_log` table

### Indexes (10 total)

Fast queries on:
- Finding date, classification, industry, score, status
- Scan history and email delivery tracking

---

## Files

### `aliofoundry.sql` (424 lines)
Complete database schema including:
- CREATE SCHEMA statements
- CREATE TYPE (enums)
- All 10 tables with constraints
- All 5 views
- All 6 triggers
- All 10 indexes
- Pre-populated industries (7 rows)

Ready to deploy to Neon as-is. No modifications needed.

### `verify.sql`
15 verification queries to test:
- Table counts
- View creation
- Industry data
- Index creation
- Trigger creation
- Test insert/read
- Summary statistics

Run after initialization to confirm everything is working.

### `init-neon.sh`
Bash script for automated setup:
- Verifies prerequisites (psql, DATABASE_URL)
- Tests Neon connection
- Optional: drops existing schema
- Runs aliofoundry.sql
- Verifies schema creation
- Optional: loads seed data
- Summary of setup

### `.env.example` (in repo root)
Template for environment variables:
```
DATABASE_URL=...
ANTHROPIC_API_KEY=...
RESEND_API_KEY=...
ADMIN_API_KEY=...
ADMIN_EMAIL=...
FROM_EMAIL=...
```

Copy to `.env` and fill in your values.

---

## Getting Started

### Prerequisites

1. **Neon account** (free at neon.tech)
2. **psql command-line tool** (PostgreSQL client)
3. **This repo** cloned locally
4. **Bash shell** (for init-neon.sh)

### Step 1: Create Neon Project

1. Go to console.neon.tech
2. Click "New Project"
3. Name: `aliofoundry`
4. Region: Choose one near you
5. PostgreSQL version: 15
6. Click "Create Project"

### Step 2: Get Connection String

1. Click "Connection String"
2. Copy the full URL
3. It looks like: `postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require`

### Step 3: Set Environment Variable

```bash
export DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require"
```

### Step 4: Run Initialization

```bash
cd /path/to/repo
chmod +x db/scripts/init-neon.sh
./db/scripts/init-neon.sh
```

You'll be prompted:
- Drop existing schema? (choose yes for fresh start)
- Load seed data? (choose no for now)

### Step 5: Verify Setup

```bash
psql "$DATABASE_URL" -f db/schema/verify.sql
```

All queries should show expected results.

### Step 6: Save DATABASE_URL for Deployment

Copy your DATABASE_URL to:
- `.env` (local development)
- Vercel project settings (production)

---

## Daily Operations Queries

Once deployed, use these queries regularly:

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

---

## Troubleshooting

### "Connection refused"
- Verify DATABASE_URL is correct
- Check you're using PostgreSQL format (not MySQL)
- Verify Neon project is running (green checkmark in console)
- Try connecting via Neon SQL Editor first (web interface)

### "Table doesn't exist"
- Run verification: `./db/schema/verify.sql`
- Check table schema exists: `SELECT * FROM information_schema.tables WHERE table_schema = 'usecase';`
- Verify schema SQL ran without errors

### "Permission denied"
- Check PostgreSQL user has schema creation permissions
- Verify role is not restricted
- Contact Neon support if issue persists

### "Constraint violation on insert"
- Verify total_score = sum of 6 individual scores
- Check classification matches score range:
  - CRITICAL: 24-30
  - HIGH: 18-23
  - STANDARD: 12-17
  - LOW: 6-11
  - SKIP: <6

---

## Configuration

### Neon Specific Settings

- **SSL Mode:** `require` (already in schema)
- **Connection Pooling:** Enabled by default
- **Compute Resources:** Free tier (shared)
- **Backup:** Automatic daily
- **Storage:** 3 GB free tier

### PostgreSQL Version

- **Version:** 15 (recommended)
- **Extensions:** None required (using standard SQL)

### Performance

- 10 indexes for fast querying
- Suitable for 5,000-10,000 findings/month
- Free tier sufficient for 1+ year of data

---

## Deployment

### To Vercel

1. Set `DATABASE_URL` in Vercel project settings
2. Deploy code to Vercel
3. API endpoints will automatically connect
4. Test with: `curl https://your-domain.vercel.app/api/orchestrate?action=status`

### To Other Hosting

1. Set `DATABASE_URL` in your environment
2. Ensure network access to Neon (add IPs to whitelist if needed)
3. Connect via connection string in your code
4. Example (Node.js): `const db = neon(process.env.DATABASE_URL)`

---

## Support

- **Neon Docs:** https://neon.tech/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/15/
- **Schema File:** `schema/aliofoundry.sql` (well-commented)
- **Verification:** Run `verify.sql` to test everything

---

## Next Steps

1. ✅ Create Neon project
2. ✅ Run init-neon.sh
3. ✅ Run verify.sql
4. → Set DATABASE_URL in Vercel
5. → Deploy API endpoints
6. → Test with curl commands
7. → Watch automated scans run daily

---

**AlioFoundry Database** | Built in Cowork | February 28, 2026
