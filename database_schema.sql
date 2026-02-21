-- ============================================
-- BIRTHDAY REMINDER APP - DATABASE SCHEMA
-- ============================================
-- 
-- This SQL file ensures the birthdays table has all required columns
-- for the reminder email system to function correctly.
--
-- Run this in Supabase SQL editor:
-- 1. Go to https://supabase.com > Your Project > SQL Editor
-- 2. Create new query
-- 3. Paste this entire file
-- 4. Click "Run"
--
-- ============================================

-- Main birthdays table with all required fields
CREATE TABLE IF NOT EXISTS birthdays (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    
    -- Optional fields
    nickname TEXT,
    notes TEXT,
    image_url TEXT,
    
    -- Relative reminder preferences (legacy, array of days before)
    reminder_preferences INTEGER[] DEFAULT '{}',
    
    -- Absolute custom reminder (exact date/time for single reminder)
    reminder_datetime TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    
    -- Email status tracking (NEVER auto-modified, only by scheduled job)
    reminder_sent BOOLEAN DEFAULT FALSE,
    birthday_email_sent BOOLEAN DEFAULT FALSE,
    
    -- Starred/favorite flag
    is_starred BOOLEAN DEFAULT FALSE,
    
    -- Audit timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint: user_id + name + date_of_birth must be unique per user
    CONSTRAINT unique_user_birthday UNIQUE(user_id, name, date_of_birth)
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_birthdays_user_id ON birthdays(user_id);

-- Create index on date_of_birth for faster reminder queries
CREATE INDEX IF NOT EXISTS idx_birthdays_date_of_birth ON birthdays(date_of_birth);

-- Create index on reminder_datetime for scheduled job queries
CREATE INDEX IF NOT EXISTS idx_birthdays_reminder_datetime ON birthdays(reminder_datetime);

-- Enable RLS on birthdays table
ALTER TABLE birthdays ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own birthdays
CREATE POLICY "Users can read their own birthdays"
    ON birthdays
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own birthdays
CREATE POLICY "Users can insert their own birthdays"
    ON birthdays
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own birthdays
CREATE POLICY "Users can update their own birthdays"
    ON birthdays
    FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own birthdays
CREATE POLICY "Users can delete their own birthdays"
    ON birthdays
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- IMPORTANT NOTES:
-- ============================================
-- 1. reminder_datetime has NO DEFAULT VALUE - it's always NULL until user sets it
-- 2. reminder_sent and birthday_email_sent track which emails have been sent
-- 3. The scheduled Edge Function will NEVER auto-assign reminder_datetime
-- 4. The scheduled Edge Function will ONLY update reminder_sent and birthday_email_sent
-- 5. All user edits happen only via authenticated frontend actions
-- ============================================
