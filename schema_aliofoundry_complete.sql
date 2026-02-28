/**
 * AlioFoundry Intelligence Platform - Complete Database Schema
 * PostgreSQL (Neon)
 *
 * Fresh database for findings, use cases, and intelligence data
 * Subscribers remain in their original system
 *
 * Created: February 28, 2026
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEMAS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS usecase;
CREATE SCHEMA IF NOT EXISTS content;
CREATE SCHEMA IF NOT EXISTS operations;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENUM TYPES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE usecase.finding_classification AS ENUM (
  'CRITICAL',
  'HIGH',
  'STANDARD',
  'LOW',
  'SKIP'
);

CREATE TYPE usecase.finding_status AS ENUM (
  'Agent-Scanned',
  'Approved',
  'Rejected',
  'Published',
  'Archived'
);

CREATE TYPE operations.change_action AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'REJECT',
  'PUBLISH'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- LOOKUP TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usecase.industries (
  industry_id SMALLINT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  key_signals TEXT[],
  sub_sectors VARCHAR(100)[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO usecase.industries (industry_id, name, description, key_signals, sub_sectors) VALUES
  (1, 'Finance & Accounting', 'CFOs, controllers, and financial operations teams',
   ARRAY['Close automation', 'FP&A AI', 'Audit workflows', 'Treasury management'],
   ARRAY['Accounting', 'Controllers', 'CFO Office', 'Treasury']),
  (2, 'PE & M&A', 'Private equity and M&A professionals',
   ARRAY['Deal sourcing', 'Valuation AI', 'Due diligence automation', 'Portfolio management'],
   ARRAY['PE Firms', 'Investment Banks', 'Corporate Development']),
  (3, 'Legal Tech', 'In-house and outside counsel',
   ARRAY['Contract review', 'Due diligence', 'Legal research', 'Compliance'],
   ARRAY['Corporate Legal', 'Contract Management', 'Legal Operations', 'Compliance']),
  (4, 'Manufacturing & Distribution', 'Supply chain and operations leaders',
   ARRAY['Supply chain AI', 'Demand forecasting', 'Inventory optimization', 'Logistics'],
   ARRAY['Supply Chain', 'Operations', 'Procurement', 'Logistics']),
  (5, 'Enterprise Software', 'SaaS and enterprise technology',
   ARRAY['Platform AI', 'Developer tools', 'Infrastructure', 'Productivity'],
   ARRAY['SaaS Vendors', 'Enterprise Platforms', 'Dev Tools']),
  (6, 'Healthcare', 'Healthcare providers, payers, and operations',
   ARRAY['Clinical AI', 'Revenue cycle', 'Patient outcomes', 'Administrative workflows'],
   ARRAY['Healthcare Providers', 'Health Systems', 'Revenue Cycle', 'Clinical Operations']),
  (7, 'Aerospace & Defense', 'Defense contractors and aerospace engineers',
   ARRAY['Predictive maintenance', 'Autonomous systems', 'Supply chain', 'Threat detection'],
   ARRAY['Defense Contractors', 'Aerospace', 'System Engineering']);

-- ═══════════════════════════════════════════════════════════════════════════════
-- MAIN FINDINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS usecase.findings (
  finding_id BIGSERIAL PRIMARY KEY,
  source_url VARCHAR(2048) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  date DATE NOT NULL,
  industry_id SMALLINT NOT NULL REFERENCES usecase.industries(industry_id),
  category VARCHAR(100) NOT NULL,
  summary TEXT NOT NULL,

  -- 6-Dimensional Scores (1-5 each)
  relevance_score SMALLINT CHECK (relevance_score >= 1 AND relevance_score <= 5),
  evidence_quality_score SMALLINT CHECK (evidence_quality_score >= 1 AND evidence_quality_score <= 5),
  actionability_score SMALLINT CHECK (actionability_score >= 1 AND actionability_score <= 5),
  novelty_score SMALLINT CHECK (novelty_score >= 1 AND novelty_score <= 5),
  source_authority_score SMALLINT CHECK (source_authority_score >= 1 AND source_authority_score <= 5),
  documentation_quality_score SMALLINT CHECK (documentation_quality_score >= 1 AND documentation_quality_score <= 5),

  -- Aggregated Score
  total_score SMALLINT NOT NULL CHECK (total_score >= 5 AND total_score <= 30),
  classification usecase.finding_classification NOT NULL,

  -- Finding Details
  key_stats TEXT,  -- Semicolon-delimited string
  tools_mentioned TEXT,  -- Comma-delimited string
  documentation_links TEXT,  -- Semicolon-delimited URLs
  action VARCHAR(100),  -- e.g., 'add_to_industry_scan'

  -- Status & Metadata
  status usecase.finding_status DEFAULT 'Agent-Scanned',
  week_added DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign Keys
  CONSTRAINT summary_length CHECK (LENGTH(summary) >= 20 AND LENGTH(summary) <= 2500),
  CONSTRAINT scores_sum CHECK (
    (relevance_score + evidence_quality_score + actionability_score +
     novelty_score + source_authority_score + documentation_quality_score) = total_score
  )
);

CREATE INDEX idx_findings_date ON usecase.findings(date DESC);
CREATE INDEX idx_findings_classification ON usecase.findings(classification);
CREATE INDEX idx_findings_industry_id ON usecase.findings(industry_id);
CREATE INDEX idx_findings_total_score ON usecase.findings(total_score DESC);
CREATE INDEX idx_findings_week_added ON usecase.findings(week_added DESC);
CREATE INDEX idx_findings_status ON usecase.findings(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTENT TABLES (Articles, Repositories, Use Cases)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS content.use_cases (
  use_case_id BIGSERIAL PRIMARY KEY,
  industry_id SMALLINT NOT NULL REFERENCES usecase.industries(industry_id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  company_name VARCHAR(255),
  status VARCHAR(50),
  date_discovered DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_use_cases_industry ON content.use_cases(industry_id);
CREATE INDEX idx_use_cases_status ON content.use_cases(status);

CREATE TABLE IF NOT EXISTS content.articles (
  article_id BIGSERIAL PRIMARY KEY,
  url VARCHAR(2048) NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  source_name VARCHAR(255),
  published_date DATE,
  industry_id SMALLINT REFERENCES usecase.industries(industry_id),
  summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_articles_industry ON content.articles(industry_id);
CREATE INDEX idx_articles_source ON content.articles(source_name);
CREATE INDEX idx_articles_date ON content.articles(published_date DESC);

CREATE TABLE IF NOT EXISTS content.repositories (
  repo_id BIGSERIAL PRIMARY KEY,
  url VARCHAR(2048) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  owner VARCHAR(255),
  platform VARCHAR(50),  -- github, gitlab, etc.
  industry_id SMALLINT REFERENCES usecase.industries(industry_id),
  description TEXT,
  stars INTEGER,
  last_updated DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_repositories_industry ON content.repositories(industry_id);
CREATE INDEX idx_repositories_platform ON content.repositories(platform);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT & OPERATIONS TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operations.change_log (
  log_id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(100),
  record_id BIGINT,
  action operations.change_action,
  user_id VARCHAR(255) DEFAULT 'system',
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_change_log_table ON operations.change_log(table_name);
CREATE INDEX idx_change_log_action ON operations.change_log(action);
CREATE INDEX idx_change_log_date ON operations.change_log(created_at DESC);

CREATE TABLE IF NOT EXISTS operations.scan_runs (
  scan_id BIGSERIAL PRIMARY KEY,
  scan_date DATE NOT NULL UNIQUE,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  findings_count INTEGER,
  critical_count INTEGER,
  high_count INTEGER,
  standard_count INTEGER,
  low_count INTEGER,
  skip_count INTEGER,
  avg_score NUMERIC(3, 1),
  status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scan_runs_date ON operations.scan_runs(scan_date DESC);
CREATE INDEX idx_scan_runs_status ON operations.scan_runs(status);

CREATE TABLE IF NOT EXISTS operations.approvals (
  approval_id BIGSERIAL PRIMARY KEY,
  finding_id BIGINT NOT NULL REFERENCES usecase.findings(finding_id),
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  approved BOOLEAN DEFAULT FALSE,
  comments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_approvals_finding ON operations.approvals(finding_id);
CREATE INDEX idx_approvals_status ON operations.approvals(approved);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EMAIL DELIVERY TRACKING (for findings → subscribers)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS operations.email_deliveries (
  delivery_id BIGSERIAL PRIMARY KEY,
  finding_id BIGINT REFERENCES usecase.findings(finding_id),
  subscriber_email VARCHAR(255),  -- Email from external subscriber system
  email_type VARCHAR(50),  -- 'daily', 'weekly', 'alert'
  sent_at TIMESTAMP,
  status VARCHAR(50),  -- 'pending', 'sent', 'bounced', 'failed'
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_deliveries_finding ON operations.email_deliveries(finding_id);
CREATE INDEX idx_email_deliveries_status ON operations.email_deliveries(status);
CREATE INDEX idx_email_deliveries_sent ON operations.email_deliveries(sent_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEWS FOR DASHBOARD & REPORTING
-- ═══════════════════════════════════════════════════════════════════════════════

-- View: Findings with industry names
CREATE OR REPLACE VIEW usecase.findings_with_industry AS
SELECT
  f.*,
  i.name AS industry_name,
  i.sub_sectors
FROM usecase.findings f
LEFT JOIN usecase.industries i ON f.industry_id = i.industry_id;

-- View: Classification summary
CREATE OR REPLACE VIEW usecase.findings_summary AS
SELECT
  COUNT(*) AS total_findings,
  SUM(CASE WHEN classification = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
  SUM(CASE WHEN classification = 'HIGH' THEN 1 ELSE 0 END) AS high_count,
  SUM(CASE WHEN classification = 'STANDARD' THEN 1 ELSE 0 END) AS standard_count,
  SUM(CASE WHEN classification = 'LOW' THEN 1 ELSE 0 END) AS low_count,
  ROUND(AVG(total_score)::numeric, 1) AS avg_score,
  ROUND(MAX(total_score)::numeric, 1) AS max_score,
  ROUND(MIN(total_score)::numeric, 1) AS min_score
FROM usecase.findings;

-- View: Industry breakdown
CREATE OR REPLACE VIEW usecase.industry_breakdown AS
SELECT
  i.industry_id,
  i.name,
  COUNT(f.finding_id) AS finding_count,
  SUM(CASE WHEN f.classification = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
  SUM(CASE WHEN f.classification = 'HIGH' THEN 1 ELSE 0 END) AS high_count,
  ROUND(AVG(f.total_score)::numeric, 1) AS avg_score
FROM usecase.industries i
LEFT JOIN usecase.findings f ON i.industry_id = f.industry_id
GROUP BY i.industry_id, i.name
ORDER BY finding_count DESC;

-- View: Content inventory
CREATE OR REPLACE VIEW content.inventory AS
SELECT
  'use_cases' AS content_type,
  COUNT(*) AS total,
  NULL::INTEGER AS by_industry_count
FROM content.use_cases
UNION ALL
SELECT
  'articles' AS content_type,
  COUNT(*) AS total,
  NULL::INTEGER AS by_industry_count
FROM content.articles
UNION ALL
SELECT
  'repositories' AS content_type,
  COUNT(*) AS total,
  NULL::INTEGER AS by_industry_count
FROM content.repositories;

-- View: Documentation quality trends
CREATE OR REPLACE VIEW usecase.documentation_quality_metrics AS
SELECT
  CASE
    WHEN documentation_quality_score = 5 THEN 'Excellent (5)'
    WHEN documentation_quality_score = 4 THEN 'Good (4)'
    WHEN documentation_quality_score = 3 THEN 'Fair (3)'
    WHEN documentation_quality_score = 2 THEN 'Poor (2)'
    WHEN documentation_quality_score = 1 THEN 'No docs (1)'
  END AS quality_level,
  COUNT(*) AS finding_count,
  ROUND(AVG(total_score)::numeric, 1) AS avg_total_score
FROM usecase.findings
GROUP BY documentation_quality_score
ORDER BY documentation_quality_score DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Update modified timestamp
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_findings_timestamp BEFORE UPDATE ON usecase.findings
FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER update_industries_timestamp BEFORE UPDATE ON usecase.industries
FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER update_use_cases_timestamp BEFORE UPDATE ON content.use_cases
FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER update_articles_timestamp BEFORE UPDATE ON content.articles
FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER update_repositories_timestamp BEFORE UPDATE ON content.repositories
FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER update_approvals_timestamp BEFORE UPDATE ON operations.approvals
FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Log all changes to audit table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION log_finding_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO operations.change_log (table_name, record_id, action, details)
  VALUES (
    'findings',
    NEW.finding_id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'INSERT'::operations.change_action
      WHEN TG_OP = 'UPDATE' THEN 'UPDATE'::operations.change_action
      WHEN TG_OP = 'DELETE' THEN 'DELETE'::operations.change_action
    END,
    jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'old_score', OLD.total_score,
      'new_score', NEW.total_score,
      'classification', NEW.classification
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_finding_changes AFTER INSERT OR UPDATE OR DELETE ON usecase.findings
FOR EACH ROW EXECUTE FUNCTION log_finding_change();

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA (Optional - comment out if not needed)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Record first scan run as baseline
INSERT INTO operations.scan_runs (
  scan_date, start_time, end_time, findings_count,
  critical_count, high_count, standard_count,
  low_count, skip_count, avg_score, status
) VALUES (
  CURRENT_DATE - INTERVAL '1 day',
  CURRENT_TIMESTAMP - INTERVAL '1 day',
  CURRENT_TIMESTAMP - INTERVAL '1 day' + INTERVAL '30 minutes',
  0, 0, 0, 0, 0, 0, 0, 'completed'
)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFY SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════════

-- Run these queries to verify the schema was created correctly:
-- SELECT * FROM information_schema.tables WHERE table_schema IN ('usecase', 'content', 'operations');
-- SELECT * FROM usecase.industries;
-- SELECT * FROM information_schema.views WHERE table_schema IN ('usecase', 'content', 'operations');

COMMIT;
