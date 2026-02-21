# ⚡ QUICK REFERENCE - Birthday Reminder Deployment

**⏱ Estimated Setup Time: 20 minutes**

---

## 📋 Pre-Flight Checklist
- [ ] Supabase project ready
- [ ] Resend.com free account created
- [ ] You have access to Supabase Dashboard

---

## 🚀 5-STEP DEPLOYMENT

### Step 1️⃣: Apply Database Schema (5 min)
```
1. Open: https://supabase.com/dashboard
2. Select your project
3. Go to: SQL Editor > New Query
4. Copy contents of: database_schema.sql
5. Paste and Run
✓ You should see: "CREATE TABLE" and 4 "CREATE POLICY" messages
```

### Step 2️⃣: Get Resend API Key (3 min)
```
1. Visit: https://app.resend.com/
2. Sign up (free tier available)
3. Copy your API key
4. Save it - you'll need it in Step 4
```

### Step 3️⃣: Deploy Edge Function (5 min)
```
1. Supabase Dashboard > Functions > Create Function
2. Name: send-birthday-reminders
3. Copy entire contents of: supabase_send_birthday_reminders.ts
4. Paste into the function editor
5. Click: Deploy
✓ Wait for "Deployed successfully" message
```

### Step 4️⃣: Set Environment Variables (2 min)
```
1. Functions > send-birthday-reminders > Environment variables
2. Add new variable:
   Key: RESEND_API_KEY
   Value: [paste your Resend key from Step 2]
3. Optional - Add security token:
   Key: SUPABASE_CRON_TOKEN
   Value: [any random secure string]
4. Click Save
```

### Step 5️⃣: Configure Cron Trigger (3 min)
```
1. Functions > send-birthday-reminders > Triggers
2. Click: Add Trigger
3. Select: Cron
4. Cron expression: 0 0 * * *
5. Description: Daily birthday reminders (optional)
6. Click Save
✓ Trigger should now be active
```

---

## ✅ QUICK VERIFICATION (3 min)

### Test #1: Manual Function Trigger
```
1. Functions > send-birthday-reminders > Overview
2. Click the test/trigger button (if available)
3. Watch the Logs tab
✓ Should see: "🚀 Starting birthday reminder job..."
✓ Should see: "✅ Birthday reminder job complete"
```

### Test #2: Create Test Birthday
```
1. Log in to your Birthday Reminder app
2. Add birthday with today's date:
   Name: "Test User"
   DOB: [today's date]
3. Go back to Step #1 (Manual Function Trigger)
4. Check logs for:
   ✓ "🎂 Birthday today: Test User"
   ✓ "✅ Email sent to [your-email]"
```

### Test #3: Email Should Appear
```
1. Check your inbox for email from: noreply@birthdays.app
✓ Subject should be: "🎉 Birthday Reminder"
✓ Body should contain: "Today is Test User's birthday!"
```

---

## 📊 What Happens Daily

```
00:00 UTC every day:
  1. Edge Function automatically triggers
  2. Fetches ALL birthdays from database
  3. For each birthday, checks if today matches:
     - birthday_date → send birthday email
     - reminder_datetime → send reminder email
  4. Gets user's email from auth.users
  5. Sends email via Resend API
  6. Updates database flags (reminder_sent, birthday_email_sent)
  7. Logs results
```

---

## 🔧 If Something Goes Wrong

### Emails Not Sending
```
Step 1: Check your Resend account
  - Is API key valid? (https://app.resend.com/api-keys)
  - Do you have monthly credit remaining?

Step 2: Check Edge Function environment variable
  - Functions > send-birthday-reminders > Environment variables
  - Is RESEND_API_KEY set correctly?

Step 3: Check function logs
  - Functions > send-birthday-reminders > Logs
  - Look for any error messages
  - Copy error and check Resend docs
```

### Cron Not Running
```
Step 1: Verify trigger is configured
  - Functions > send-birthday-reminders > Triggers
  - Should show "Cron" trigger with expression "0 0 * * *"

Step 2: Check function logs
  - Should see entries at exactly 00:00 UTC every day
  - If not, wait for next scheduled time or test manually

Step 3: Contact Supabase support if trigger doesn't work
```

### User Not Getting Emails
```
Step 1: Check database directly
  - SQL Editor > SELECT * FROM birthdays WHERE user_id='[user_id]'
  - Is birthday_date = today? Or reminder_datetime = today?
  - Are flags birthday_email_sent or reminder_sent already TRUE?

Step 2: Manually reset flags if needed
  - UPDATE birthdays 
    SET birthday_email_sent=FALSE, reminder_sent=FALSE 
    WHERE id=[birthday_id]
  - Manually trigger function again

Step 3: Verify user email is set
  - In auth.users table, user should have email column filled
  - This comes from Google OAuth automatically
```

---

## 🎯 Files Created for You

| File | What It Does |
|------|-------------|
| **database_schema.sql** | Database schema with RLS - run once |
| **supabase_send_birthday_reminders.ts** | Edge Function code - deploy once |
| **ARCHITECTURE.md** | Complete system explanation |
| **DEPLOYMENT_GUIDE.sh** | Detailed deployment guide |
| **VERIFICATION_CHECKLIST.md** | 100-item testing checklist |
| **AUDIT_SUMMARY.md** | What was changed and why |
| **QUICK_REFERENCE.md** | This file! |

---

## 📞 Need Help?

### Documentation
- See **ARCHITECTURE.md** for system design
- See **VERIFICATION_CHECKLIST.md** for testing
- See **AUDIT_SUMMARY.md** for what changed

### Resend
- Website: https://resend.com/
- Docs: https://resend.com/docs
- Free tier: 100 emails/day

### Supabase
- Dashboard: https://supabase.com/dashboard
- Docs: https://supabase.com/docs
- Support: https://supabase.com/support

---

## 🎉 Success Indicators

You'll know everything is working when:

✅ Test birthday created with today's date  
✅ Manual function trigger shows "Email sent" in logs  
✅ Email arrives in your inbox from noreply@birthdays.app  
✅ Database shows birthday_email_sent=TRUE  
✅ Next day, function runs automatically at 00:00 UTC  
✅ New birthdays work with custom reminders  
✅ Clearing reminders sets database field to NULL  

---

## 🔐 Security Notes

- ✅ Service role key NEVER exposed in frontend
- ✅ Resend API key ONLY in Edge Function
- ✅ Users can ONLY see their own birthdays (RLS enforced)
- ✅ Emails sent to authenticated email only
- ✅ No personal data logged

---

## 📈 Monitoring

### Optional: Set Up Alerts
1. Resend sends delivery failures to your email
2. Supabase shows function errors in Logs tab
3. Check "Incoming" tab in Logs for daily runs

### Optional: Track Usage
- Resend Dashboard shows email count/status
- Supabase shows function execution metrics
- Database size increases by ~1KB per birthday

---

## 🚦 System Status

After deployment, your system will:

```
✓ Send birthday emails automatically daily
✓ Send custom reminder emails daily
✓ Work even if user is offline
✓ Prevent duplicate emails (flag system)
✓ Log all activities for debugging
✓ Preserve all existing features
✓ Maintain security via RLS
```

---

**Last Updated**: February 21, 2026  
**Complexity Level**: ⭐⭐ (Easy - copy/paste friendly)  
**Maintenance Required**: Minimal (check logs occasionally)  
**Questions?**: See other documentation files or Supabase docs
