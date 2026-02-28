# AlioFoundry Intelligence Platform

Enterprise AI development discovery and scoring system. Scans 24+ sources daily, evaluates findings on 6 dimensions, writes results to Neon PostgreSQL.

**Built in Cowork** | February 28, 2026

---

## What This Is

A complete platform for discovering, evaluating, and tracking enterprise AI developments across 7 industry verticals:
- Finance & Accounting
- PE & M&A
- Legal Tech
- Manufacturing & Distribution
- Enterprise Software
- Healthcare
- Aerospace & Defense

**How it works:**
1. Claude agent scans 24 prioritized sources (CFO Dive, TechCrunch, Gartner, etc.)
2. Evaluates each finding on 6 dimensions (max 30 points)
3. Classifies as CRITICAL | HIGH | STANDARD | LOW | SKIP
4. Writes to Neon PostgreSQL
5. Sends daily/weekly digests to subscribers

---

## Quick Start

### 1. Initialize Neon Database (15 minutes)

```bash
# Set your Neon connection
export DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/neondb"

# Run setup
./db/scripts/init-neon.sh

# Verify
psql "$DATABASE_URL" -f db/schema/verify.sql
```

### 2. Configure Environment (5 minutes)

```bash
# Copy template
cp .env.example .env

# Fill in your values:
# - DATABASE_URL (from Neon)
# - ANTHROPIC_API_KEY (from Claude)
# - RESEND_API_KEY (from Resend)
# - ADMIN_API_KEY (generate random 32-char string)
```

### 3. Deploy to Vercel (5 minutes)

```bash
git push origin main
```

(Vercel auto-deploys on push)

---

## Database Schema

**10 Tables**
- `findings` - Main table (6-dimensional scores)
- `industries` - 7 verticals
- `use_cases`, `articles`, `repositories` - Content
- `change_log` - Audit trail
- `scan_runs` - Daily scan history
- More...

**5 Views** for dashboard and reporting
**6 Triggers** for automation and auditing
**10 Indexes** for fast queries

See `db/README.md` for complete details.

---

## API Endpoints

**POST /api/agent-scan** — Trigger intelligence scan
**POST /api/orchestrate** — Data validation & pipeline (6 actions)
**POST /api/notify** — Email notifications

See `api/` directory for implementation.

---

## Deployment

- [ ] Create Neon project
- [ ] Run `./db/scripts/init-neon.sh`
- [ ] Copy `.env.example` → `.env` and fill in
- [ ] Push to GitHub
- [ ] Deploy to Vercel (auto on push)
- [ ] Set environment variables in Vercel
- [ ] Test with curl commands

**Total time:** 30-45 minutes

---

## Quick Links

- **Database:** `db/README.md`
- **Setup Script:** `db/scripts/init-neon.sh`
- **Schema:** `db/schema/aliofoundry.sql` (424 lines, well-commented)
- **Configuration:** `.env.example`
- **API:** `api/` directory

---

**AlioFoundry Intelligence Platform**
Built in Cowork | Anthropic Claude | February 28, 2026
