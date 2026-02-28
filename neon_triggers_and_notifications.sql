-- ═══════════════════════════════════════════════════════════
-- AlioFoundry — Event-Driven Notification Layer
-- Run AFTER neon_schema.sql + neon_seed_data.sql
-- ═══════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────
-- 1. CHANGE LOG — captures all writes across core tables
-- ───────────────────────────────────────────────────────────

CREATE TABLE usecase.change_log (
    id              SERIAL PRIMARY KEY,
    table_name      TEXT NOT NULL,
    record_id       INTEGER NOT NULL,
    change_type     TEXT NOT NULL,           -- 'INSERT', 'UPDATE', 'DELETE'
    entity_type     TEXT NOT NULL,           -- 'use_case', 'repository', 'article', 'scan', 'scorecard', 'pe_use_case', 'industry_entry', 'repo_link'
    summary         TEXT,                    -- human-readable: "New use case: AI-powered invoice matching (Finance)"
    payload         JSONB,                   -- full row data for the notification template
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Processing flags (each output marks independently)
    notified        BOOLEAN NOT NULL DEFAULT false,
    notified_at     TIMESTAMPTZ,
    daily_included  BOOLEAN NOT NULL DEFAULT false,
    daily_at        TIMESTAMPTZ,
    weekly_included BOOLEAN NOT NULL DEFAULT false,
    weekly_at       TIMESTAMPTZ
);

CREATE INDEX idx_changelog_unnotified ON usecase.change_log(notified) WHERE notified = false;
CREATE INDEX idx_changelog_daily ON usecase.change_log(daily_included, created_at) WHERE daily_included = false;
CREATE INDEX idx_changelog_weekly ON usecase.change_log(weekly_included, created_at) WHERE weekly_included = false;
CREATE INDEX idx_changelog_created ON usecase.change_log(created_at);
CREATE INDEX idx_changelog_entity ON usecase.change_log(entity_type);

-- ───────────────────────────────────────────────────────────
-- 2. NOTIFICATION LOG — tracks every email sent
-- ───────────────────────────────────────────────────────────

CREATE TABLE usecase.notification_log (
    id              SERIAL PRIMARY KEY,
    notification_type TEXT NOT NULL,         -- 'realtime', 'daily_preview', 'weekly_update'
    recipient       TEXT NOT NULL,
    subject         TEXT NOT NULL,
    changes_count   INTEGER NOT NULL DEFAULT 0,
    change_ids      INTEGER[],              -- references change_log.id
    resend_id       TEXT,                   -- Resend message ID for tracking
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          TEXT DEFAULT 'sent'     -- 'sent', 'delivered', 'bounced', 'failed'
);

CREATE INDEX idx_notif_type ON usecase.notification_log(notification_type, sent_at);

-- ───────────────────────────────────────────────────────────
-- 3. TRIGGER FUNCTION — fires on INSERT to tracked tables
-- ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION usecase.log_change() RETURNS TRIGGER AS $$
DECLARE
    v_entity_type TEXT;
    v_summary TEXT;
    v_payload JSONB;
BEGIN
    -- Determine entity type and build summary
    CASE TG_TABLE_NAME
        WHEN 'use_cases' THEN
            v_entity_type := 'use_case';
            v_summary := format('New use case: %s (%s)', NEW.name, NEW.category);
            v_payload := jsonb_build_object(
                'name', NEW.name, 'category', NEW.category,
                'description', NEW.description, 'industry_id', NEW.industry_id
            );
            
        WHEN 'repositories' THEN
            v_entity_type := 'repository';
            v_summary := format('New repo: %s (%s)', NEW.name, NEW.repo_type);
            v_payload := jsonb_build_object(
                'name', NEW.name, 'repo_type', NEW.repo_type,
                'description', NEW.description, 'url', NEW.url,
                'stars', NEW.stars, 'industry_id', NEW.industry_id
            );
            
        WHEN 'research_articles' THEN
            v_entity_type := 'article';
            v_summary := format('New article: %s (%s)', NEW.title, NEW.organization);
            v_payload := jsonb_build_object(
                'title', NEW.title, 'organization', NEW.organization,
                'synopsis', NEW.synopsis, 'url', NEW.url
            );
            
        WHEN 'scan_articles' THEN
            v_entity_type := 'article';
            v_summary := format('Scan article: %s — %s', NEW.source, NEW.title);
            v_payload := jsonb_build_object(
                'source', NEW.source, 'title', NEW.title,
                'why_it_matters', NEW.why_it_matters, 'url', NEW.url
            );
            
        WHEN 'weekly_scans' THEN
            v_entity_type := 'scan';
            v_summary := format('Weekly scan: %s — %s use cases, %s articles',
                NEW.week_ending, NEW.total_use_cases, NEW.total_articles);
            v_payload := jsonb_build_object(
                'week_ending', NEW.week_ending, 'total_use_cases', NEW.total_use_cases,
                'total_articles', NEW.total_articles, 'total_repos', NEW.total_repos
            );
            
        WHEN 'scan_scorecard' THEN
            v_entity_type := 'scorecard';
            v_summary := format('Scorecard: %s — %s (%s)', NEW.dimension, NEW.status, NEW.movement);
            v_payload := jsonb_build_object(
                'dimension', NEW.dimension, 'status', NEW.status,
                'movement', NEW.movement, 'headline', NEW.headline
            );
            
        WHEN 'pe_use_cases' THEN
            v_entity_type := 'pe_use_case';
            v_summary := format('PE use case: %s', NEW.name);
            v_payload := jsonb_build_object(
                'name', NEW.name, 'description', NEW.description,
                'stage_id', NEW.stage_id
            );
            
        WHEN 'industry_scan_entries' THEN
            v_entity_type := 'industry_entry';
            v_summary := format('Industry entry: %s — %s', NEW.name, COALESCE(NEW.entry_type, 'Use Case'));
            v_payload := jsonb_build_object(
                'name', NEW.name, 'description', NEW.description,
                'entry_type', NEW.entry_type, 'industry_id', NEW.industry_id
            );
            
        WHEN 'repo_use_cases' THEN
            v_entity_type := 'repo_link';
            v_summary := format('Repo-UC link: repo %s → use case %s (%s)',
                NEW.repository_id, NEW.use_case_id, COALESCE(NEW.confidence, 'Manual'));
            v_payload := jsonb_build_object(
                'repository_id', NEW.repository_id, 'use_case_id', NEW.use_case_id,
                'source_file', NEW.source_file, 'confidence', NEW.confidence
            );
            
        ELSE
            v_entity_type := TG_TABLE_NAME;
            v_summary := format('New %s record (id: %s)', TG_TABLE_NAME, NEW.id);
            v_payload := '{}'::jsonb;
    END CASE;
    
    INSERT INTO usecase.change_log (table_name, record_id, change_type, entity_type, summary, payload)
    VALUES (TG_TABLE_NAME, NEW.id, TG_OP, v_entity_type, v_summary, v_payload);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────
-- 4. ATTACH TRIGGERS TO ALL TRACKED TABLES
-- ───────────────────────────────────────────────────────────

CREATE TRIGGER trg_use_cases_log
    AFTER INSERT ON usecase.use_cases
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_repositories_log
    AFTER INSERT ON usecase.repositories
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_research_articles_log
    AFTER INSERT ON usecase.research_articles
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_scan_articles_log
    AFTER INSERT ON usecase.scan_articles
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_weekly_scans_log
    AFTER INSERT ON usecase.weekly_scans
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_scan_scorecard_log
    AFTER INSERT ON usecase.scan_scorecard
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_pe_use_cases_log
    AFTER INSERT ON usecase.pe_use_cases
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_industry_scan_entries_log
    AFTER INSERT ON usecase.industry_scan_entries
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

CREATE TRIGGER trg_repo_use_cases_log
    AFTER INSERT ON usecase.repo_use_cases
    FOR EACH ROW EXECUTE FUNCTION usecase.log_change();

-- ───────────────────────────────────────────────────────────
-- 5. VIEWS FOR EACH NOTIFICATION TYPE
-- ───────────────────────────────────────────────────────────

-- Unprocessed changes for real-time notification
CREATE VIEW usecase.v_pending_notifications AS
SELECT 
    cl.*,
    i.name AS industry_name
FROM usecase.change_log cl
LEFT JOIN usecase.use_cases uc ON cl.table_name = 'use_cases' AND cl.record_id = uc.id
LEFT JOIN usecase.industries i ON uc.industry_id = i.id
WHERE cl.notified = false
ORDER BY cl.created_at;

-- Today's unprocessed changes for daily preview
CREATE VIEW usecase.v_daily_preview AS
SELECT 
    entity_type,
    COUNT(*) AS count,
    array_agg(id) AS change_ids,
    array_agg(summary) AS summaries
FROM usecase.change_log
WHERE daily_included = false
  AND created_at >= CURRENT_DATE
GROUP BY entity_type
ORDER BY 
    CASE entity_type
        WHEN 'use_case' THEN 1
        WHEN 'repository' THEN 2
        WHEN 'article' THEN 3
        WHEN 'scorecard' THEN 4
        WHEN 'scan' THEN 5
        ELSE 6
    END;

-- This week's unprocessed changes for weekly rollup
CREATE VIEW usecase.v_weekly_rollup AS
SELECT 
    entity_type,
    COUNT(*) AS count,
    array_agg(id) AS change_ids,
    array_agg(summary) AS summaries
FROM usecase.change_log
WHERE weekly_included = false
  AND created_at >= date_trunc('week', CURRENT_DATE)
GROUP BY entity_type
ORDER BY count DESC;

-- Notification history (last 30 days)
CREATE VIEW usecase.v_notification_history AS
SELECT 
    notification_type,
    DATE(sent_at) AS sent_date,
    COUNT(*) AS emails_sent,
    SUM(changes_count) AS total_changes
FROM usecase.notification_log
WHERE sent_at >= now() - INTERVAL '30 days'
GROUP BY notification_type, DATE(sent_at)
ORDER BY sent_date DESC, notification_type;

-- ───────────────────────────────────────────────────────────
-- 6. HELPER FUNCTIONS FOR NOTIFICATION PROCESSING
-- ───────────────────────────────────────────────────────────

-- Mark changes as notified (called after real-time email sent)
CREATE OR REPLACE FUNCTION usecase.mark_notified(p_change_ids INTEGER[])
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE usecase.change_log
    SET notified = true, notified_at = now()
    WHERE id = ANY(p_change_ids) AND notified = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Mark changes as included in daily preview
CREATE OR REPLACE FUNCTION usecase.mark_daily(p_change_ids INTEGER[])
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE usecase.change_log
    SET daily_included = true, daily_at = now()
    WHERE id = ANY(p_change_ids) AND daily_included = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Mark changes as included in weekly update
CREATE OR REPLACE FUNCTION usecase.mark_weekly(p_change_ids INTEGER[])
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE usecase.change_log
    SET weekly_included = true, weekly_at = now()
    WHERE id = ANY(p_change_ids) AND weekly_included = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Daily summary stats (for the daily preview header)
CREATE OR REPLACE FUNCTION usecase.daily_stats()
RETURNS TABLE(
    new_use_cases BIGINT,
    new_repos BIGINT,
    new_articles BIGINT,
    new_scorecard BIGINT,
    new_pe_use_cases BIGINT,
    new_industry_entries BIGINT,
    new_repo_links BIGINT,
    total_changes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE entity_type = 'use_case'),
        COUNT(*) FILTER (WHERE entity_type = 'repository'),
        COUNT(*) FILTER (WHERE entity_type = 'article'),
        COUNT(*) FILTER (WHERE entity_type = 'scorecard'),
        COUNT(*) FILTER (WHERE entity_type = 'pe_use_case'),
        COUNT(*) FILTER (WHERE entity_type = 'industry_entry'),
        COUNT(*) FILTER (WHERE entity_type = 'repo_link'),
        COUNT(*)
    FROM usecase.change_log
    WHERE daily_included = false
      AND created_at >= CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────
-- 7. CONFIGURATION TABLE (notification settings)
-- ───────────────────────────────────────────────────────────

CREATE TABLE usecase.notification_config (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    description     TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO usecase.notification_config (key, value, description) VALUES
    ('admin_email', 'henry@aliofoundry.com', 'Primary notification recipient'),
    ('from_email', 'intelligence@aliofoundry.com', 'Sender address (must match Resend verified domain)'),
    ('realtime_enabled', 'true', 'Send immediate notification on batch inserts'),
    ('realtime_min_changes', '1', 'Minimum changes to trigger realtime notification'),
    ('daily_enabled', 'true', 'Send daily preview email'),
    ('daily_cron', '0 12 * * *', '7:00 AM CT (UTC-5) daily'),
    ('daily_skip_empty', 'true', 'Skip daily email if no new changes'),
    ('weekly_enabled', 'true', 'Send weekly status update'),
    ('weekly_cron', '0 12 * * 5', '7:00 AM CT Fridays'),
    ('weekly_include_scorecard', 'true', 'Include dimension scorecard in weekly email'),
    ('weekly_include_trend', 'true', 'Include week-over-week trend in weekly email');
