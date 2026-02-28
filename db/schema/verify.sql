/**
 * AlioFoundry Schema Verification Script
 *
 * Run this after initialization to verify everything is set up correctly.
 * All queries should return non-zero results if schema is healthy.
 */

-- ============================================================================
-- TEST 1: Count tables (should be 10)
-- ============================================================================

SELECT 'TABLE COUNT' as test_name,
       COUNT(*) as result
FROM information_schema.tables
WHERE table_schema IN ('usecase', 'content', 'operations');

-- Expected: 10

-- ============================================================================
-- TEST 2: List all tables by schema
-- ============================================================================

SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('usecase', 'content', 'operations')
ORDER BY table_schema, table_name;

-- Expected: 10 rows total

-- ============================================================================
-- TEST 3: Count views (should be 5)
-- ============================================================================

SELECT 'VIEW COUNT' as test_name,
       COUNT(*) as result
FROM information_schema.views
WHERE table_schema IN ('usecase', 'content', 'operations');

-- Expected: 5

-- ============================================================================
-- TEST 4: List all views
-- ============================================================================

SELECT table_schema, table_name
FROM information_schema.views
WHERE table_schema IN ('usecase', 'content', 'operations')
ORDER BY table_schema, table_name;

-- Expected: 5 rows

-- ============================================================================
-- TEST 5: Check industries (should be 7)
-- ============================================================================

SELECT 'INDUSTRIES' as test_name,
       COUNT(*) as count,
       STRING_AGG(name, ', ' ORDER BY industry_id) as industries
FROM usecase.industries;

-- Expected: 7 industries

-- ============================================================================
-- TEST 6: Industries detail
-- ============================================================================

SELECT industry_id, name, ARRAY_LENGTH(sub_sectors, 1) as sub_sector_count
FROM usecase.industries
ORDER BY industry_id;

-- Expected:
-- 1 | Finance & Accounting | 4
-- 2 | PE & M&A | 3
-- 3 | Legal Tech | 4
-- 4 | Manufacturing & Distribution | 3
-- 5 | Enterprise Software | 3
-- 6 | Healthcare | 4
-- 7 | Aerospace & Defense | 3

-- ============================================================================
-- TEST 7: Check indexes (should be 10)
-- ============================================================================

SELECT 'INDEX COUNT' as test_name,
       COUNT(*) as result
FROM pg_indexes
WHERE schemaname IN ('usecase', 'content', 'operations');

-- Expected: ~10 indexes

-- ============================================================================
-- TEST 8: List all indexes
-- ============================================================================

SELECT schemaname, indexname, tablename
FROM pg_indexes
WHERE schemaname IN ('usecase', 'content', 'operations')
ORDER BY schemaname, tablename;

-- ============================================================================
-- TEST 9: Check triggers (should be 7)
-- ============================================================================

SELECT 'TRIGGER COUNT' as test_name,
       COUNT(*) as result
FROM information_schema.triggers
WHERE trigger_schema IN ('usecase', 'content', 'operations');

-- Expected: 7 triggers

-- ============================================================================
-- TEST 10: List all triggers
-- ============================================================================

SELECT trigger_schema, trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema IN ('usecase', 'content', 'operations')
ORDER BY trigger_schema, event_object_table;

-- ============================================================================
-- TEST 11: Test insert (create test finding)
-- ============================================================================

INSERT INTO usecase.findings (
  source_url, source_name, title, date, industry_id, category,
  summary, relevance_score, evidence_quality_score, actionability_score,
  novelty_score, source_authority_score, documentation_quality_score,
  total_score, classification, week_added
) VALUES (
  'https://example.com/test-finding',
  'Test Source',
  'Test Finding - Schema Verification',
  CURRENT_DATE,
  1,
  'Test',
  'This is a test finding to verify the database schema and constraints are working correctly. The scores validate properly.',
  5, 5, 5, 5, 5, 5,
  30,
  'CRITICAL',
  CURRENT_DATE
);

-- ============================================================================
-- TEST 12: Verify insert worked
-- ============================================================================

SELECT 'TEST INSERT' as test_name,
       COUNT(*) as result
FROM usecase.findings
WHERE title = 'Test Finding - Schema Verification';

-- Expected: 1

-- ============================================================================
-- TEST 13: View test finding with industry
-- ============================================================================

SELECT f.finding_id, f.title, f.total_score, f.classification,
       i.name as industry_name
FROM usecase.findings f
LEFT JOIN usecase.industries i ON f.industry_id = i.industry_id
WHERE f.title = 'Test Finding - Schema Verification';

-- Expected: 1 row with CRITICAL classification, 30 score, Finance & Accounting

-- ============================================================================
-- TEST 14: Test summary view
-- ============================================================================

SELECT * FROM usecase.findings_summary;

-- Expected: Shows stats including our test finding

-- ============================================================================
-- TEST 15: Check change log (should have audit entry)
-- ============================================================================

SELECT COUNT(*) as audit_entries
FROM operations.change_log
WHERE table_name = 'findings';

-- Expected: 1 (from our insert)

-- ============================================================================
-- CLEANUP: Delete test data
-- ============================================================================

-- DELETE FROM usecase.findings WHERE title = 'Test Finding - Schema Verification';

-- Uncomment above to clean up test finding
-- (Keep commented to verify insert worked)

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================

-- If all tests above show expected results, your schema is ready!
-- Summary query:

SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema IN ('usecase', 'content', 'operations')) as tables,
  (SELECT COUNT(*) FROM information_schema.views WHERE table_schema IN ('usecase', 'content', 'operations')) as views,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema IN ('usecase', 'content', 'operations')) as triggers,
  (SELECT COUNT(*) FROM usecase.industries) as industries,
  (SELECT COUNT(*) FROM usecase.findings) as findings,
  (SELECT COUNT(*) FROM operations.change_log) as audit_entries,
  CURRENT_TIMESTAMP as verified_at;

-- Expected:
-- tables | views | triggers | industries | findings | audit_entries | verified_at
--   10   |   5   |    7     |     7      |    1     |       1       | 2026-02-28...
