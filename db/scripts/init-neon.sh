#!/bin/bash

##############################################################################
# AlioFoundry Neon Database Initialization Script
#
# Usage: ./init-neon.sh
#
# This script:
# 1. Verifies Neon connection
# 2. Drops existing schema (optional)
# 3. Runs the complete schema
# 4. Verifies schema creation
# 5. Seeds initial data (optional)
#
# Prerequisites:
# - DATABASE_URL environment variable set
# - psql command-line tool installed
# - Network access to Neon
##############################################################################

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Utility functions
log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
  echo -e "${RED}✗ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

# ============================================================================
# PHASE 1: Verify environment
# ============================================================================

log_info "Phase 1: Verifying environment..."

if [ -z "$DATABASE_URL" ]; then
  log_error "DATABASE_URL environment variable not set"
  echo ""
  echo "Set it with:"
  echo "  export DATABASE_URL='postgresql://user:password@host.neon.tech/neondb'"
  exit 1
fi

log_success "DATABASE_URL is set"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  log_error "psql command not found. Please install PostgreSQL client tools."
  exit 1
fi

log_success "psql is installed"

# ============================================================================
# PHASE 2: Test connection
# ============================================================================

log_info "Phase 2: Testing Neon connection..."

if psql "$DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
  log_success "Connection to Neon successful"
else
  log_error "Cannot connect to Neon. Check DATABASE_URL."
  exit 1
fi

# ============================================================================
# PHASE 3: Drop existing schema (optional)
# ============================================================================

log_info "Phase 3: Preparing database..."

read -p "Drop existing AlioFoundry schema? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  log_warning "Dropping existing schemas..."
  psql "$DATABASE_URL" << EOF
DROP SCHEMA IF EXISTS usecase CASCADE;
DROP SCHEMA IF EXISTS content CASCADE;
DROP SCHEMA IF EXISTS operations CASCADE;
EOF
  log_success "Old schemas dropped"
else
  log_info "Keeping existing schema"
fi

# ============================================================================
# PHASE 4: Run schema SQL
# ============================================================================

log_info "Phase 4: Creating schema..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/../schema/aliofoundry.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
  log_error "Schema file not found: $SCHEMA_FILE"
  exit 1
fi

log_info "Using schema: $SCHEMA_FILE"

# Run the schema
if psql "$DATABASE_URL" -f "$SCHEMA_FILE" > /dev/null 2>&1; then
  log_success "Schema created successfully"
else
  log_error "Failed to create schema"
  exit 1
fi

# ============================================================================
# PHASE 5: Verify schema
# ============================================================================

log_info "Phase 5: Verifying schema..."

# Count tables
TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema IN ('usecase', 'content', 'operations')
")

log_info "Found $TABLE_COUNT tables"

if [ "$TABLE_COUNT" -eq 10 ]; then
  log_success "Expected 10 tables ✓"
else
  log_warning "Expected 10 tables, found $TABLE_COUNT"
fi

# Count views
VIEW_COUNT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*)
  FROM information_schema.views
  WHERE table_schema IN ('usecase', 'content', 'operations')
")

log_info "Found $VIEW_COUNT views"

# Check industries
INDUSTRY_COUNT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*) FROM usecase.industries
")

log_info "Industries loaded: $INDUSTRY_COUNT"

if [ "$INDUSTRY_COUNT" -eq 7 ]; then
  log_success "All 7 industries loaded ✓"
fi

# ============================================================================
# PHASE 6: Optional seed data
# ============================================================================

read -p "Load optional seed data? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  SEED_FILE="$SCRIPT_DIR/../seed/initial-data.sql"

  if [ -f "$SEED_FILE" ]; then
    log_info "Loading seed data..."
    if psql "$DATABASE_URL" -f "$SEED_FILE" > /dev/null 2>&1; then
      log_success "Seed data loaded"
    else
      log_warning "Seed data load had warnings (may be OK)"
    fi
  else
    log_warning "Seed file not found: $SEED_FILE (skipping)"
  fi
fi

# ============================================================================
# PHASE 7: Summary
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
log_success "AlioFoundry database initialized successfully!"
echo ""
echo "Connection details:"
echo "  Database: Neon PostgreSQL"
echo "  URL: $DATABASE_URL"
echo ""
echo "Schemas created:"
echo "  • usecase (findings, industries)"
echo "  • content (use_cases, articles, repositories)"
echo "  • operations (change_log, scan_runs, approvals, email_deliveries)"
echo ""
echo "Next steps:"
echo "  1. Set DATABASE_URL in your .env or Vercel:"
echo "     export DATABASE_URL='$DATABASE_URL'"
echo ""
echo "  2. Run verification queries (see db/schema/verify.sql)"
echo ""
echo "  3. Deploy API endpoints:"
echo "     git push origin main"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Make it executable for next time
chmod +x "$0"

log_success "Setup complete!"
exit 0
