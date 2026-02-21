#!/bin/bash

# ============================================
# DEPLOYMENT GUIDE - Birthday Reminder System
# ============================================
#
# This script helps deploy the scheduled Edge Function for birthday reminders.
#
# Prerequisites:
# 1. Supabase CLI installed: npm install -g supabase
# 2. You have a Resend.com account and API key (for sending emails)
# 3. You're logged into Supabase: supabase login
#
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🎂 Birthday Reminder - Edge Function Deployment${NC}"
echo ""

# Step 1: Verify Supabase CLI
echo -e "${YELLOW}Step 1: Checking Supabase CLI...${NC}"
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI not found. Install it first:${NC}"
    echo "npm install -g supabase"
    exit 1
fi
echo -e "${GREEN}✅ Supabase CLI found${NC}"

# Step 2: Project setup
echo -e "${YELLOW}Step 2: Setting up project...${NC}"
ls -la supabase/ 2>/dev/null || {
    echo "📁 Creating supabase directory..."
    mkdir -p supabase/functions/send-birthday-reminders
}
echo -e "${GREEN}✅ Project structure ready${NC}"

# Step 3: Copy Edge Function
echo -e "${YELLOW}Step 3: Copying Edge Function...${NC}"
echo "📋 Using TypeScript Edge Function from: supabase_send_birthday_reminders.ts"
echo "🔹 The function will:"
echo "   • Run daily at 00:00 UTC via cron schedule"
echo "   • Fetch all birthdays from your database"
echo "   • Compare today's date (month-day only) with:"
echo "     - birthday_date for birthday emails"
echo "     - reminder_datetime for custom reminder emails"
echo "   • Get user's email via user_id → auth.users join"
echo "   • Send HTML emails via Resend API"
echo "   • Update reminder_sent and birthday_email_sent flags"
echo "   • Work even if user is offline"
echo ""

# Step 4: Environment Setup
echo -e "${YELLOW}Step 4: Configuring environment...${NC}"
echo "📝 You need to set environment variables in Supabase:"
echo ""
echo "Required:"
echo "  • RESEND_API_KEY - Get from https://app.resend.com/ (free tier available)"
echo "  • SUPABASE_SERVICE_ROLE_KEY - Already available in your project (use service role)"
echo ""
echo "Optional security:"
echo "  • SUPABASE_CRON_TOKEN - Custom token to prevent unauthorized calls"
echo ""

# Step 5: Database Schema
echo -e "${YELLOW}Step 5: Updating database schema...${NC}"
echo -e "${GREEN}✅ Database schema file created (see database_schema.sql)${NC}"
echo ""
echo "📋 To apply schema changes:"
echo "   1. Open Supabase Dashboard > SQL Editor"
echo "   2. Create new query"
echo "   3. Copy contents of database_schema.sql"
echo "   4. Paste and run"
echo ""
echo "The schema includes:"
echo "   • birthdays table with all required columns"
echo "   • Indices for faster queries"
echo "   • RLS policies for security"
echo ""

# Step 6: Instructions
echo -e "${YELLOW}Step 6: Next manual steps...${NC}"
echo ""
echo "1️⃣ COPY EDGE FUNCTION TO SUPABASE"
echo "   cd d:\\AJ\\Birthday"
echo "   mkdir -p supabase\\functions\\send-birthday-reminders"
echo "   Copy supabase_send_birthday_reminders.ts to supabase\\functions\\send-birthday-reminders\\index.ts"
echo ""
echo "2️⃣ DEPLOY EDGE FUNCTION"
echo "   supabase functions deploy send-birthday-reminders --project-id YOUR_PROJECT_ID"
echo ""
echo "3️⃣ SET ENVIRONMENT VARIABLES"
echo "   Go to Supabase Dashboard > Project Settings > Edge Functions"
echo "   Add:"
echo "     • RESEND_API_KEY = your_resend_api_key"
echo "     • SUPABASE_CRON_TOKEN = your_secret_token (optional but recommended)"
echo ""
echo "4️⃣ CONFIGURE CRON TRIGGER"
echo "   Go to Supabase Dashboard > Functions > send-birthday-reminders"
echo "   Add trigger:"
echo "     • Type: Cron"
echo "     • Cron expression: 0 0 * * *  (Daily at 00:00 UTC)"
echo "     • Name: send-birthday-reminders-daily"
echo ""
echo "5️⃣ TEST THE FUNCTION"
echo "   You can test manually:"
echo "   curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/send-birthday-reminders \\\\"
echo "     -H 'Authorization: Bearer YOUR_JWT_TOKEN'"
echo ""
echo "6️⃣ VERIFY LOGS"
echo "   Supabase Dashboard > Functions > send-birthday-reminders > Logs"
echo ""

echo -e "${GREEN}🎉 Deployment guide complete!${NC}"
echo ""
echo "For questions, see:"
echo "  • Supabase Docs: https://supabase.com/docs/guides/functions"
echo "  • Resend Docs: https://resend.com/docs"
