# External Subscriber Database Integration

**Scenario:** Subscribers are in a separate database (not Neon)
**Goal:** Email findings to external subscribers while keeping data separate
**Status:** Integration ready

---

## Architecture

```
┌─────────────────────────┐
│  AlioFoundry            │
│  Neon Database          │
│                         │
│ • findings              │
│ • use_cases             │
│ • email_deliveries ────┐│
└─────────────────────────┘
                          │
                          │ (query for subscriber list)
                          │
┌─────────────────────────┐│
│  Subscriber System      ││
│  External Database      ││
│                         ││
│ • subscribers           ││
│ • subscriptions         ││
│ • preferences          ◄─┘
└─────────────────────────┘
```

---

## What I Need From You

To set up the integration, I need to know:

### 1. **What type of database are your subscribers in?**
   - [ ] PostgreSQL (like Neon/RDS)
   - [ ] MySQL
   - [ ] SQL Server
   - [ ] MongoDB
   - [ ] REST API endpoint
   - [ ] CSV file (in storage)
   - [ ] Other: ___________

### 2. **If Database: What's the connection string?**
   ```
   postgresql://user:password@host:port/database
   # OR
   mysql://user:password@host:port/database
   # OR
   Your connection string: ___________
   ```

### 3. **What table has active subscribers?**
   ```sql
   -- What's the table name?
   -- Example: subscribers, users, contacts, etc.

   -- What columns exist?
   -- Required: email (or email_address)
   -- Optional: first_name, last_name, company, preferences

   Your table structure: ___________
   ```

### 4. **How do I query active subscribers?**
   ```sql
   -- Example query that returns active subscriber emails:
   SELECT email FROM subscribers WHERE status = 'active'

   -- Your query: ___________
   ```

### 5. **If REST API: What's the endpoint?**
   ```
   https://subscribers.yourcompany.com/api/active

   Your endpoint: ___________
   ```

---

## Integration Approach

### Option A: Direct Database Connection (Most Common)

**When to use:** Subscribers are in PostgreSQL, MySQL, or other relational DB

**In api/notify.js:**
```javascript
// Get subscriber list from external database
const externalDB = await connectToExternalDatabase(
  process.env.EXTERNAL_SUBSCRIBER_DB_URL
);

const subscribers = await externalDB.query(
  `SELECT email FROM subscribers WHERE status = 'active'`
);

// Send email to each subscriber
for (const subscriber of subscribers) {
  await sendEmail({
    to: subscriber.email,
    subject: emailContent.subject,
    html: emailContent.html
  });

  // Log delivery in AlioFoundry DB
  await insertIntoDeliveryLog(finding_id, subscriber.email, 'sent');
}
```

**Required environment variable:**
```
EXTERNAL_SUBSCRIBER_DB_URL=postgresql://user:pass@host/db
```

### Option B: REST API Connection (If using API)

**When to use:** Subscribers are exposed via REST API

**In api/notify.js:**
```javascript
const response = await fetch(
  `${process.env.SUBSCRIBER_API_ENDPOINT}/active-subscribers`,
  {
    headers: {
      'Authorization': `Bearer ${process.env.SUBSCRIBER_API_KEY}`
    }
  }
);

const subscribers = await response.json();

// Send to each
for (const subscriber of subscribers) {
  await sendEmail({
    to: subscriber.email,
    ...
  });
}
```

**Required environment variables:**
```
SUBSCRIBER_API_ENDPOINT=https://api.yourcompany.com/subscribers
SUBSCRIBER_API_KEY=your-api-key-here
```

### Option C: CSV File (Simple, Limited)

**When to use:** Small subscriber list, doesn't change often

**In api/notify.js:**
```javascript
const fs = require('fs');
const csv = require('csv-parse/sync');

const fileContent = fs.readFileSync(
  process.env.SUBSCRIBER_CSV_PATH,
  'utf8'
);

const subscribers = csv.parse(fileContent, {
  columns: true
});

// Send to each
for (const subscriber of subscribers) {
  if (subscriber.status === 'active') {
    await sendEmail({
      to: subscriber.email,
      ...
    });
  }
}
```

**Required environment variable:**
```
SUBSCRIBER_CSV_PATH=/path/to/subscribers.csv
```

---

## Current api/notify.js Implementation

The notify endpoint **already has a placeholder** for external subscriber queries:

```javascript
// In api/notify.js - notify handler

// TODO: Query external subscriber database
const recipients = []; // Should be filled from external DB

// For now, using ADMIN_EMAIL as default
const recipient = process.env.ADMIN_EMAIL || 'admin@aliofoundry.com';

// This should become:
const externalDB = await connectToExternalDatabase(...);
const subscribers = await externalDB.query(
  'SELECT email FROM subscribers WHERE status = active'
);
const recipients = subscribers.map(s => s.email);
```

---

## Implementation Steps

### Step 1: Get External DB Information

**Gather from your team:**
- Database type (PostgreSQL, MySQL, etc.)
- Connection string or API endpoint
- Table/schema name with subscribers
- Email column name
- Active/status filtering logic

### Step 2: Update Environment Variables

**In Vercel, add:**

For PostgreSQL:
```
EXTERNAL_SUBSCRIBER_DB_URL=postgresql://user:password@host/database
EXTERNAL_SUBSCRIBER_DB_QUERY=SELECT email FROM subscribers WHERE status = 'active'
```

For REST API:
```
SUBSCRIBER_API_ENDPOINT=https://api.yourcompany.com/subscribers
SUBSCRIBER_API_KEY=your-api-key
```

For CSV:
```
SUBSCRIBER_CSV_PATH=/tmp/subscribers.csv
```

### Step 3: Implement Connector Function

**Create api/lib/subscriber-connector.js:**

```javascript
/**
 * Query external subscriber database
 */

export async function getActiveSubscribers() {
  const dbType = process.env.EXTERNAL_DB_TYPE; // 'postgresql' | 'mysql' | 'api' | 'csv'

  switch (dbType) {
    case 'postgresql':
      return await queryPostgres();
    case 'mysql':
      return await queryMySQL();
    case 'api':
      return await queryAPI();
    case 'csv':
      return await queryCSV();
    default:
      throw new Error(`Unknown DB type: ${dbType}`);
  }
}

async function queryPostgres() {
  const { Client } = require('pg');
  const client = new Client(process.env.EXTERNAL_SUBSCRIBER_DB_URL);

  try {
    await client.connect();
    const result = await client.query(
      process.env.EXTERNAL_SUBSCRIBER_DB_QUERY ||
      `SELECT email FROM subscribers WHERE status = 'active'`
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

async function queryAPI() {
  const response = await fetch(
    `${process.env.SUBSCRIBER_API_ENDPOINT}/active`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.SUBSCRIBER_API_KEY}`
      }
    }
  );
  return await response.json();
}

// ... other database types
```

### Step 4: Update api/notify.js

```javascript
import { getActiveSubscribers } from './lib/subscriber-connector.js';

// In handleDailyDigest or handleWeeklyNewsletter:
async function sendNotification(emailType) {
  // Get subscribers from external database
  const subscribers = await getActiveSubscribers();

  if (!subscribers || subscribers.length === 0) {
    return res.status(400).json({
      error: 'No active subscribers found'
    });
  }

  const emailContent = generateDailyDigest(); // or weekly

  let successCount = 0;
  let failureCount = 0;

  // Send to each subscriber
  for (const subscriber of subscribers) {
    try {
      const sendResult = await sendEmail({
        to: subscriber.email,
        from: process.env.FROM_EMAIL,
        subject: emailContent.subject,
        html: emailContent.html
      });

      // Log in AlioFoundry DB
      await sql`
        INSERT INTO operations.email_deliveries (
          subscriber_email, email_type, sent_at, status
        ) VALUES (
          ${subscriber.email},
          ${emailType},
          NOW(),
          'sent'
        )
      `;

      successCount++;
    } catch (error) {
      failureCount++;
      console.error(`Failed to send to ${subscriber.email}:`, error);

      // Log failure
      await sql`
        INSERT INTO operations.email_deliveries (
          subscriber_email, email_type, status, error_message
        ) VALUES (
          ${subscriber.email},
          ${emailType},
          'failed',
          ${error.message}
        )
      `;
    }
  }

  return res.status(200).json({
    success: true,
    message: `Sent to ${successCount} subscribers`,
    success_count: successCount,
    failure_count: failureCount
  });
}
```

---

## Environment Variables Needed

### For PostgreSQL External DB:
```env
# Neon (AlioFoundry findings)
DATABASE_URL=postgresql://...@neon.tech/neondb

# External (Subscribers)
EXTERNAL_DB_TYPE=postgresql
EXTERNAL_SUBSCRIBER_DB_URL=postgresql://user:pass@host/database
EXTERNAL_SUBSCRIBER_DB_QUERY=SELECT email, first_name FROM subscribers WHERE status = 'active'
```

### For MySQL External DB:
```env
EXTERNAL_DB_TYPE=mysql
EXTERNAL_SUBSCRIBER_DB_URL=mysql://user:pass@host/database
EXTERNAL_SUBSCRIBER_DB_QUERY=SELECT email FROM subscribers WHERE active = 1
```

### For REST API:
```env
EXTERNAL_DB_TYPE=api
SUBSCRIBER_API_ENDPOINT=https://api.company.com/subscribers
SUBSCRIBER_API_KEY=sk_your_api_key
```

### Common to All:
```env
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
ADMIN_API_KEY=...
ADMIN_EMAIL=henry@aliofoundry.com
FROM_EMAIL=intelligence@aliofoundry.com
```

---

## Database Requirements

**Minimum table structure needed:**
```sql
-- Subscriber table (from your external DB)
CREATE TABLE subscribers (
  subscriber_id INT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  status VARCHAR(50),  -- 'active', 'inactive', 'unsubscribed'
  created_at TIMESTAMP
);
```

**Your query should return at minimum:**
```
email (required)
first_name (optional, for personalization)
last_name (optional)
preferences (optional, for filtering)
```

---

## Testing the Integration

### Test 1: Verify Connection
```bash
curl -X POST \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  https://aliofoundry.vercel.app/api/test-subscriber-connection
```

### Test 2: Get Subscriber Count
```bash
curl -X GET \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  https://aliofoundry.vercel.app/api/subscribers/count
```

### Test 3: Send Test Email to One Subscriber
```bash
curl -X POST \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' \
  https://aliofoundry.vercel.app/api/test-email
```

### Test 4: Send Daily Digest
```bash
curl -X POST \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  https://aliofoundry.vercel.app/api/notify?type=daily
```

---

## Potential Issues & Solutions

### "Connection refused"
- Check external DB is accessible from Vercel
- Verify firewall allows Vercel IPs
- Test connection string locally first

### "No subscribers found"
- Verify query returns results
- Check subscriber status field name
- Test query directly in DB console

### "Email delivery failed"
- Check Resend API key is valid
- Verify FROM_EMAIL domain is verified in Resend
- Check email addresses are valid

### "Timeout errors"
- Increase Vercel function timeout to 300 seconds
- Add connection pooling to subscriber DB queries
- Cache subscriber list (update hourly)

---

## Security Considerations

✅ **Best Practices:**
- Store connection strings in Vercel secrets only
- Never log subscriber emails to console
- Use parameterized queries (prevent SQL injection)
- Track delivery attempts in AlioFoundry DB
- Implement unsubscribe handling
- Respect subscriber preferences

❌ **Avoid:**
- Hardcoding connection strings
- Logging full email addresses
- Direct string concatenation in queries
- Sending without unsubscribe link
- Ignoring GDPR/privacy regulations

---

## Next Actions

**For you to do:**

1. **Identify the subscriber database:**
   - What type? (PostgreSQL, MySQL, API, etc.)
   - Where is it located?
   - Who can provide connection details?

2. **Provide connection information:**
   - Connection string OR API endpoint
   - Table/schema name
   - Email column name
   - Active status query

3. **Verify access:**
   - Can Vercel reach the database?
   - Are there firewall restrictions?
   - Do we need VPN or IP whitelisting?

4. **Once ready:**
   - I'll implement the connector
   - We'll test with sample emails
   - Deploy to Vercel

---

**Once you provide the subscriber database details, I can:**

✅ Create the subscriber connector
✅ Update api/notify.js for multi-database queries
✅ Test the email delivery pipeline
✅ Deploy and verify end-to-end

---

## Files Related to This

- `api/notify.js` — Email notification endpoint (needs update)
- `NEON-SETUP-GUIDE.md` — AlioFoundry DB setup
- `DEPLOYMENT-CHECKLIST.md` — Full deployment path
- `schema_aliofoundry_complete.sql` — AlioFoundry schema

---

**Ready to proceed?** Please provide:
1. Database type (PostgreSQL, MySQL, API, etc.)
2. Connection string or API endpoint
3. Table name and email column
4. Active subscriber query

Once I have these, we'll wire up the integration! 🔌
