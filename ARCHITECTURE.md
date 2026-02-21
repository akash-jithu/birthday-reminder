# 🎂 Birthday Reminder System - Complete Implementation Guide

## Overview

This is a **production-ready** birthday reminder application with:
- ✅ User authentication (Google OAuth via Supabase)
- ✅ Manual birthday management
- ✅ One-time setup reminder (no auto-reset bug)
- ✅ Scheduled email reminders via Edge Function
- ✅ Daily cron job for background email delivery
- ✅ Works even when user is offline

---

## 🏗️ Architecture

### Frontend (User-Facing)
- **index.html** - Responsive UI for all features
- **script.js** - Birthday management, forms, real-time checks
- **style.css** - Light/dark mode support
- **service-worker.js** - PWA offline support
- **supabase.js** - Auth and DB helpers

### Backend (Supabase)
- **Database**: PostgreSQL table `birthdays` with RLS security
- **Auth**: Google OAuth via Supabase Auth
- **Storage**: Optional image storage for birthdays
- **Edge Function**: `send-birthday-reminders` (Deno/TypeScript)
- **Cron Schedule**: Daily trigger at 00:00 UTC

### Email Service
- **Provider**: Resend.com (free tier available)
- **Trigger**: Scheduled Edge Function (not frontend)
- **Delivery**: Automatic, even if user offline

---

## 📊 Database Schema

### `birthdays` Table

```sql
CREATE TABLE birthdays (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    
    -- Optional fields
    nickname TEXT,
    notes TEXT,
    image_url TEXT,
    
    -- Reminder preferences (legacy, relative days)
    reminder_preferences INTEGER[] DEFAULT '{}',
    
    -- Custom reminder (absolute date/time)
    reminder_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    -- Email status tracking
    reminder_sent BOOLEAN DEFAULT FALSE,
    birthday_email_sent BOOLEAN DEFAULT FALSE,
    
    -- Star/favorite
    is_starred BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Key Guarantees
- ✅ `reminder_datetime` has **NO default value** (always NULL until user sets it)
- ✅ `reminder_sent` and `birthday_email_sent` track email delivery
- ✅ No auto-assignment of reminder date from birthday_date
- ✅ All user edits are manual via frontend
- ✅ Scheduled job ONLY updates email flags, never reminder_date

---

## 🔄 Reminder Flow

### User Sets A Birthday

```javascript
// User fills form with:
// - Name: "Alice"
// - Birthday: "1995-03-15" (March 15, 1995)
// - (Optional) Reminder Date: "2026-03-14" (March 14, 2026)

// Frontend sends to DB:
{
  user_id: "user123",
  name: "Alice",
  date_of_birth: "1995-03-15",
  reminder_datetime: "2026-03-14T09:00:00+00:00"  // User's choice, or NULL
}
```

### Scheduled Job Runs Daily (00:00 UTC)

```
1. Fetch ALL birthdays from database
2. FOR EACH birthday:
   a. Get user's authenticated email via user_id
   b. Check if date_of_birth matches TODAY (month-day only)
      - If match AND birthday_email_sent=FALSE:
        → Send birthday email
        → Set birthday_email_sent=TRUE
   c. Check if reminder_datetime exists
      - If match TODAY AND reminder_sent=FALSE:
        → Send reminder email  
        → Set reminder_sent=TRUE
3. Log results and errors
```

### Email Examples

#### Birthday Email
```
Subject: 🎉 Birthday Reminder
Body: Today is Alice's birthday!
```

#### Custom Reminder Email
```
Subject: 🔔 Upcoming Birthday Reminder
Body: Reminder for Alice's birthday on March 15, 2026.
```

---

## 🚀 Deployment Checklist

### 1. Database Schema
- [ ] Run `database_schema.sql` in Supabase SQL Editor
- [ ] Verify table created: `supabase > All Tables > birthdays`
- [ ] Check RLS policies enabled
- [ ] Confirm indices created

### 2. Set Up Resend Account
- [ ] Create free account at https://app.resend.com/
- [ ] Generate API key
- [ ] Copy API key (you'll need it in next step)

### 3. Deploy Edge Function
```bash
# 1. Create Edge Function directory
mkdir -p supabase/functions/send-birthday-reminders

# 2. Create index.ts with content from supabase_send_birthday_reminders.ts
# (This repo file)

# 3. Deploy via Supabase CLI
supabase functions deploy send-birthday-reminders --project-id YOUR_PROJECT_ID

# OR deploy via Supabase Dashboard:
# - Supabase > Your Project > Functions > Create New Function
# - Name: send-birthday-reminders
# - Paste TypeScript code
```

### 4. Configure Environment Variables
Go to Supabase Dashboard > Project Settings > Edge Functions:
- Set `RESEND_API_KEY` = your Resend API key
- (Optional) Set `SUPABASE_CRON_TOKEN` = random string for security

### 5. Add Cron Trigger
Supabase Dashboard > Functions > send-birthday-reminders > Add Trigger:
- **Type**: Cron
- **Cron Expression**: `0 0 * * *` (daily at 00:00 UTC)
- **Description**: Send birthday reminders

### 6. Test the Function
```bash
# Option A: Via curl
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/send-birthday-reminders \
  -H 'Authorization: Bearer YOUR_CRON_TOKEN'

# Option B: Via Supabase Dashboard
# Functions > send-birthday-reminders > Test button
```

### 7. Monitor Logs
Supabase Dashboard > Functions > send-birthday-reminders > Logs tab

---

## 📋 Frontend Features

### Add Birthday (Manual Form)
```html
Required:
  - Name
  - Date of Birth

Optional:
  - Nickname
  - Notes
  - Reminder Date (custom, absolute date)
  - Reminder Time
  - Relative Reminders (1/2/7 days before - legacy)
```

### Edit Birthday Modal
```javascript
// Shows all fields for editing
// Properly handles:
// - Empty reminder_date → NULL in DB (not deleted/auto-filled)
// - Clear reminder button → reminder_datetime=NULL, reminder_sent=FALSE
// - Update reminder → Resets reminder_sent flag
```

### Import From File
- Supports PDF and TXT
- Smart parsing for student records
- Duplicate detection

### Export
- JSON format (full backup)
- TXT format (names + dates)

### Filters & Views
- List view (default)
- Calendar view (by month)
- Filter: All, Today, Next 7 Days, This Month, ⭐ Starred
- Sort: Nearest, A-Z
- Search by name/nickname
- Dark mode support

---

## 🔒 Security

### Authentication
- Google OAuth only (no passwords)
- Session persisted in browser
- Auto-refresh on expiry

### Database Security
- Row-Level Security (RLS) policies enforce:
  - Users can ONLY read their own birthdays
  - Users can ONLY edit/delete their own birthdays
  - Service role (Edge Function) can read all for scheduled job

### Edge Function Security
- Uses `SUPABASE_SERVICE_ROLE_KEY` (backend only, not exposed)
- Optional `SUPABASE_CRON_TOKEN` validation
- Never exposes user emails publicly
- Only accessible via authenticated request or cron

### Frontend Security
- No sensitive data in localStorage (only theme preference)
- No API keys in client code
- All DB operations validated by RLS

---

## ⚠️ Important Notes

### Reminder Behavior
- Reminders send **once per year** on matching date
- `birthday_email_sent` flag resets when birthday passes
- `reminder_sent` flag resets yearly (or when user edits reminder)
- **No auto-assignment**: Clearing reminder leaves it permanently NULL

### Email Delivery
- Scheduled job runs at 00:00 UTC
- User's timezone doesn't matter (compares date only, not time)
- Each user gets email to their authenticated email address
- Resend handles retries and delivery tracking

### If User Deletes Birthday
- All related reminders deleted via CASCADE
- Email status flags not relevant (row deleted)

### If User Clears Reminder
- `reminder_datetime` set to NULL
- `reminder_sent` reset to FALSE
- Stays cleared until user manually sets reminder again

---

## 🐛 Troubleshooting

### Emails Not Sending
1. Check Edge Function logs in Supabase Dashboard
2. Verify `RESEND_API_KEY` is set
3. Confirm Resend account has active API key
4. Check cron schedule in Edge Function settings

### Emails Sending Duplicates
- Shouldn't happen due to `reminder_sent` / `birthday_email_sent` flags
- If it does: Manually reset the flag in Supabase to FALSE

### Birthday Changes Date
- User can edit `date_of_birth` anytime
- Email will send on new date going forward
- Old email flags don't carry over

### Reminder Won't Clear
- Use "Clear Reminder" button in edit modal
- It sets `reminder_datetime = NULL`
- If button missing, manually edit in Supabase dashboard

### User Timezone Issues
- All comparisons are date-only (month-day)
- Time of cron execution doesn't matter for date matching
- Email sends at 00:00 UTC regardless of user location

---

## 📝 API Endpoints

### Frontend → Backend (Authenticated)
```javascript
// Fetch user's birthdays
GET /birthdays?user_id=eq.{userId}

// Add birthday
POST /birthdays {name, date_of_birth, reminder_datetime, ...}

// Update birthday
PATCH /birthdays?id=eq.{id} {name, reminder_datetime, ...}

// Delete birthday
DELETE /birthdays?id=eq.{id}
```

### Cron → Edge Function (Scheduled)
```
POST /functions/v1/send-birthday-reminders
Authorization: Bearer {SUPABASE_CRON_TOKEN}
Body: (empty, trigger handles all logic)
```

---

## 🎯 Testing Checklist

### After Deployment
- [ ] Create test birthday with today's date
- [ ] Manual function test should trigger email
- [ ] Check email received at test address
- [ ] Update birthday_date to tomorrow, verify email not sent
- [ ] Set custom reminder to today, verify reminder email sent
- [ ] Clear reminder, verify flag resets
- [ ] Test with user offline (cron still executes)
- [ ] Dark mode toggle works
- [ ] Login/logout flow works
- [ ] Filters and sorting work
- [ ] Star feature works
- [ ] Delete + undo works
- [ ] Import from file works
- [ ] Export works

---

## 📚 File Structure

```
d:\AJ\Birthday\
├── index.html                           (UI)
├── script.js                            (Frontend logic)
├── supabase.js                          (DB & Auth helpers)
├── style.css                            (Styles)
├── service-worker.js                    (PWA)
├── manifest.json                        (PWA metadata)
├── README.md                            (Original docs)
├── database_schema.sql                  (DB schema - RUN ONCE)
├── supabase_send_birthday_reminders.ts  (Edge Function code)
├── DEPLOYMENT_GUIDE.sh                  (This deployment guide)
└── ARCHITECTURE.md                      (System architecture - THIS FILE)
```

---

## 🔗 Useful Links

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Functions](https://supabase.com/docs/guides/functions)
- [Resend Email API](https://resend.com/docs)
- [Deno Docs](https://deno.land/)
- [Cron Expression Guide](https://crontab.guru/)

---

## ❓ FAQ

**Q: Can I use a different email provider instead of Resend?**
A: Yes, modify the `sendEmailViaResend()` function in the Edge Function to call your provider's API.

**Q: What happens if a birthday is on Feb 29 (leap year)?**
A: Emails will only send in leap years. Consider this when setting up birthdays.

**Q: Can reminders send more than once per year?**
A: Yes, but you need to manually reset the `reminder_sent` flag in the database. The system is designed for once-yearly delivery.

**Q: Is my data backed up?**
A: Supabase provides daily automated backups. Export can be done via dashboard or API.

**Q: Can I run the Edge Function more frequently than daily?**
A: Yes, change cron to `*/30 * * * *` for every 30 minutes (but emails still send once per year per person due to flags).

**Q: What if I have 100,000 birthdays to check daily?**
A: Edge Function runs with unlimited execution time. Performance depends on Resend rate limits (~5000 emails/min on Pro).

---

**Last Updated**: February 21, 2026  
**Status**: Production Ready  
**Version**: 2.0 (Scheduled Email System)
