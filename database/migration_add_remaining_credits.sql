-- Migration: Add remaining_credits column to clients table
-- Run this in Supabase SQL Editor

-- Add remaining_credits column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS remaining_credits INTEGER DEFAULT 0;

-- Update existing clients to have 0 remaining credits if NULL
UPDATE clients 
SET remaining_credits = 0 
WHERE remaining_credits IS NULL;

