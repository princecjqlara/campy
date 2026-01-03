-- Migration: Add 'proposal-sent' phase
-- Run this in Supabase SQL Editor

-- Update the phase CHECK constraint to include 'proposal-sent'
ALTER TABLE clients 
DROP CONSTRAINT IF EXISTS clients_phase_check;

ALTER TABLE clients 
ADD CONSTRAINT clients_phase_check 
CHECK (phase IN ('proposal-sent', 'booked', 'preparing', 'testing', 'running'));

-- Update default phase to 'proposal-sent' for new clients
ALTER TABLE clients 
ALTER COLUMN phase SET DEFAULT 'proposal-sent';

-- Optional: Update existing clients that don't have a phase set
-- UPDATE clients SET phase = 'proposal-sent' WHERE phase IS NULL;

