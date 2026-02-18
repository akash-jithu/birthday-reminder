-- Run these statements in your Supabase SQL editor or via psql to add the new
-- reminder/email fields to the existing `birthdays` table. Existing rows will
-- continue to work (fields are nullable or have defaults).

ALTER TABLE public.birthdays
    ADD COLUMN IF NOT EXISTS reminder_datetime timestamp with time zone NULL,
    ADD COLUMN IF NOT EXISTS reminder_sent boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS birthday_email_sent boolean NOT NULL DEFAULT false;

-- Optionally you can create an index on reminder_datetime to speed up queries:
-- CREATE INDEX IF NOT EXISTS idx_birthdays_reminder_datetime ON public.birthdays(reminder_datetime);
