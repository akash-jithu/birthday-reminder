# 🎂 Birthday Reminder App

A web-based birthday reminder application built with:

- HTML
- CSS
- JavaScript
- Supabase (Authentication + Database)
- Vercel (Deployment)

## Features

- Google Login
- Add / Edit / Delete birthdays
- Import (PDF / TXT)
- Export (PDF / TXT)
- Notifications
- Dark Mode Support
- Undo Delete
- PWA Support

- Custom reminders with date/time
- In-app and browser notifications for reminders and birthdays
- Optional email notifications via Supabase Edge Function

## Live Demo

https://your-vercel-url.vercel.app

## Deployment

Hosted on Vercel.

## Database Migration

The new reminder/email features require additional columns on the `birthdays` table. Run the SQL in `database_updates.sql` using the Supabase SQL editor or CLI. Existing rows are unaffected.

## Edge Function

A Supabase Edge Function `send-reminder-email` has been added under `supabase/functions/send-reminder-email`. Deploy it via the Supabase CLI and configure your email provider credentials as environment variables (e.g. SendGrid API key). The frontend securely invokes this function when a reminder or birthday notification is sent.

