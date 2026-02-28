# Updated Deployment Path: Fresh DB + External Subscribers

**Decision Made:** Build fresh Neon database for AlioFoundry, keep subscribers external
**Status:** Ready to deploy
**Timeline:** 3-4 hours for full deployment
**Complexity:** Medium (two systems, clean separation)

---

## What Changed

### Original Approach ❌
- Interface with existing Neon DB with subscribers
- Risk of schema conflicts between operations
- Complex coordination

### New Approach ✅
```
┌──────────────────────────────┐
│  AlioFoundry (Fresh Neon)    │
│  • Findings                  │
│  • Use cases                 │
│  • Email delivery log        │
│  • Audit trail               │
└──────────────────────────────┘
         ↕ (read findings)
┌──────────────────────────────┐
│  Subscribers (External DB)   │
│  • Subscriber list           │
│  • Preferences               │
│  • Status                    │
└──────────────────────────────┘
```

**Benefits:**
- ✅ No schema conflicts
- ✅ Independent scaling
- ✅ Clean separation of concerns
- ✅ Easier to test/debug
- ✅ Both systems can evolve independently

---

## Deployment Phases (Updated)

### Phase 1: Fresh Neon Database Setup ⏱️ 45 min

**What:** Create brand new Neon PostgreSQL database for AlioFoundry

**Steps:**
1. Create Neon project at console.neon.tech
2. Copy connection string
3. Run `schema_aliofoundry_complete.sql` in Neon SQL editor
4. Verify with 4 test queries
5. Save `DATABASE_URL` for Vercel

**Files:**
- `schema_aliofoundry_complete.sql` ← SQL schema
- `NEON-SETUP-GUIDE.md` ← Detailed instructions

**Output:**
- Fresh Neon database ready
- `DATABASE_URL` for environment variables

---

### Phase 2: Gather External Subscriber DB Info ⏱️ 15 min

**What:** Get connection details for your existing subscriber database

**Questions to answer:**
1. What type of DB? (PostgreSQL, MySQL, API, CSV, etc.)
2. Connection string or API endpoint?
3. Table name with subscriber data?
4. Email column name?
5. How to query active subscribers?

**File:**
- `EXTERNAL-DB-INTEGRATION.md` ← Provides template questions

**Output:**
- External database connection string
- Query to fetch active subscribers

---

### Phase 3: Configure Vercel Environment ⏱️ 30 min

**What:** Set up all environment variables for Vercel

**Variables (Neon):**
```
DATABASE_URL=postgresql://...@neon.tech/neondb
```

**Variables (External Subscribers):**
```
EXTERNAL_DB_TYPE=postgresql|mysql|api|csv
EXTERNAL_SUBSCRIBER_DB_URL=postgresql://...
EXTERNAL_SUBSCRIBER_DB_QUERY=SELECT email FROM subscribers WHERE status = 'active'
```

**Variables (APIs & Services):**
```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
ADMIN_API_KEY=your-generated-key
ADMIN_EMAIL=henry@aliofoundry.com
FROM_EMAIL=intelligence@aliofoundry.com
```

**File:**
- Set in Vercel project settings → Environment Variables

---

### Phase 4: Deploy API Endpoints ⏱️ 45 min

**What:** Deploy 3 API endpoints to Vercel

**Files to deploy:**
- `api/agent-scan.js` — Trigger scans, write to Neon
- `api/orchestrate.js` — Validate findings, query/write to Neon
- `api/notify.js` — Read from Neon findings, query external DB for subscribers, send emails

**Steps:**
1. Push code to GitHub
2. Connect Vercel to repo
3. Deploy (automatic from git push)
4. Verify endpoints are live

**Testing:**
```bash
# Test 1: Health check
curl https://aliofoundry.vercel.app/api/orchestrate?action=status

# Test 2: External DB connection
curl -H "x-api-key: YOUR_KEY" \
  https://aliofoundry.vercel.app/api/test-subscriber-connection
```

**File:**
- `api/` directory with all 3 endpoints

---

### Phase 5: Wire External Subscriber Database ⏱️ 30 min

**What:** Connect api/notify.js to external subscriber database

**Steps:**
1. Create `api/lib/subscriber-connector.js` (handles connection logic)
2. Update `api/notify.js` to:
   - Query external DB for subscriber list
   - Send email to each subscriber
   - Log delivery in Neon `email_deliveries` table
3. Deploy updated code

**Code pattern:**
```javascript
// Get from external DB
const subscribers = await getActiveSubscribers();

// Send to each
for (const subscriber of subscribers) {
  await sendEmail({to: subscriber.email, ...});

  // Log in AlioFoundry Neon DB
  await insertDeliveryLog(finding_id, subscriber.email);
}
```

**File:**
- `EXTERNAL-DB-INTEGRATION.md` ← Implementation guide
- `api/lib/subscriber-connector.js` ← I'll create this
- `api/notify.js` ← I'll update this

---

### Phase 6: Configure Email Service ⏱️ 15 min

**What:** Set up Resend email delivery

**Steps:**
1. Sign up at resend.com
2. Create API key
3. Add custom domain (optional but recommended)
4. Set SPF/DKIM records
5. Store `RESEND_API_KEY` in Vercel

**File:**
- Email templates are in `api/notify.js` (already created)

---

### Phase 7: Configure Cron Jobs ⏱️ 10 min

**What:** Set up automated daily/weekly scans and emails

**In vercel.json:**
```json
{
  "crons": [
    {
      "path": "/api/agent-scan?key=${ADMIN_API_KEY}",
      "schedule": "0 8 * * *"  // 8 AM UTC = 2 AM Central
    },
    {
      "path": "/api/notify?type=daily&key=${ADMIN_API_KEY}",
      "schedule": "0 9 * * *"   // 3 AM Central
    },
    {
      "path": "/api/notify?type=weekly&key=${ADMIN_API_KEY}",
      "schedule": "0 14 * * 5"  // 9 AM Friday Central
    }
  ]
}
```

**Steps:**
1. Create/update `vercel.json` with cron configuration
2. Deploy to Vercel
3. Verify in Vercel dashboard → Crons

---

### Phase 8: Wire Dashboard to Live Data ⏱️ 30 min

**What:** Connect React dashboard to live API

**Currently:** Dashboard uses hardcoded REAL_DATA from Excel
**Update to:** Fetch from `/api/orchestrate?action=extract`

**Changes:**
```javascript
useEffect(() => {
  // Before: static data
  // setData(REAL_DATA);

  // After: live API
  fetch('/api/orchestrate?action=extract')
    .then(r => r.json())
    .then(d => setData(d));
}, []);
```

**Steps:**
1. Update dashboard component
2. Test with local API
3. Deploy to Vercel
4. Verify data refreshes

---

## Deployment Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| 1: Fresh Neon DB | 45 min | ⏳ Ready |
| 2: Get External DB Info | 15 min | ⏳ Awaiting your input |
| 3: Vercel Environment | 30 min | ⏳ Ready |
| 4: Deploy API | 45 min | ✅ Code ready |
| 5: Wire External DB | 30 min | ⏳ Awaiting DB info |
| 6: Email Service | 15 min | ✅ Configured |
| 7: Cron Jobs | 10 min | ✅ Ready |
| 8: Dashboard Wiring | 30 min | ✅ Ready |
| **Total** | **210 min** | **~3.5 hours** |

---

## What You Need to Provide

To move forward, I need:

### 1. External Subscriber Database Details
```
Database Type: _____ (PostgreSQL/MySQL/API/CSV)
Connection String: _____
Table Name: _____
Email Column: _____
Status Column: _____
Query for Active: _____
```

### 2. Neon Credentials (After Phase 1)
```
DATABASE_URL=postgresql://...@neon.tech/neondb
```

### 3. API Keys (For services)
```
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
```

---

## Files Created for This Approach

### Database
- ✅ `schema_aliofoundry_complete.sql` — Fresh Neon schema
- ✅ `NEON-SETUP-GUIDE.md` — Setup instructions

### Integration
- ✅ `EXTERNAL-DB-INTEGRATION.md` — Connect to external subscribers
- ⏳ `api/lib/subscriber-connector.js` — To be created after you provide DB details

### API Endpoints
- ✅ `api/agent-scan.js` — Trigger scans
- ✅ `api/orchestrate.js` — Data pipeline
- ✅ `api/notify.js` — Email delivery (needs subscriber-connector)

### Documentation
- ✅ `DEPLOYMENT-CHECKLIST.md` — Original checklist
- ✅ `UPDATED-DEPLOYMENT-PATH.md` — This file (new approach)
- ✅ `IMPLEMENTATION-SUMMARY.md` — Overview
- ✅ `FILE-INVENTORY.md` — File guide

---

## Updated Workflow

### Daily Automated Workflow (After Deployment)

```
2:00 AM → Cron triggers /api/agent-scan
  ↓
  Agent scans sources, generates findings JSON
  ↓
  Findings inserted into AlioFoundry Neon DB
  ↓
3:00 AM → Cron triggers /api/notify?type=daily
  ↓
  Queries Neon for findings from past 24 hours
  ↓
  Queries external DB for active subscribers
  ↓
  Generates email for each subscriber
  ↓
  Sends via Resend API
  ↓
  Logs delivery status in Neon email_deliveries table
  ↓
  Friday 9:00 AM → Weekly digest sent (same process)
```

---

## Success Criteria ✅

Deployment is complete when:

- [ ] Fresh Neon database created and verified
- [ ] `DATABASE_URL` saved
- [ ] External subscriber DB connected and tested
- [ ] 3 API endpoints deployed to Vercel
- [ ] All 6 environment variables set
- [ ] Test email sent to sample subscriber
- [ ] First automated scan executed successfully
- [ ] Findings appear in Neon database
- [ ] Email sent to all active subscribers
- [ ] Delivery log shows all emails sent/failed
- [ ] Dashboard shows live data from Neon

---

## What I Can Do Now

I'm ready to:

1. ✅ Create `subscriber-connector.js` (once you provide DB type)
2. ✅ Update `api/notify.js` to use external DB
3. ✅ Provide exact SQL/API queries for your system
4. ✅ Create test scripts to verify connectivity
5. ✅ Update dashboard to use live API
6. ✅ Create monitoring/health check endpoints

---

## Next Step for You

### **Please provide:**

1. **External subscriber database information**
   - Database type
   - Connection string or API endpoint
   - Table/schema structure
   - Active subscriber query

2. **Resend email API key**
   - From resend.com

**Once I have this information, I'll:**
1. Create subscriber connector code
2. Update email notification endpoint
3. Provide test commands for end-to-end verification
4. Create deployment checklist for final wiring

---

## Reference Guides

**Depending on your DB type, these will help:**

- **PostgreSQL:** `EXTERNAL-DB-INTEGRATION.md` Section A
- **MySQL:** `EXTERNAL-DB-INTEGRATION.md` Section B
- **REST API:** `EXTERNAL-DB-INTEGRATION.md` Section C
- **CSV:** `EXTERNAL-DB-INTEGRATION.md` Section D

---

**Status:** 🟢 Ready for Phase 1 (Fresh Neon DB)

Want to start with Phase 1 (Neon setup) while you gather external DB info? Or should we wait until you have all the details?

Let me know! 🚀
