-- Fix Duplicate Contacts in Facebook Conversations
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Find and show duplicates before fixing
-- ============================================
-- SELECT participant_id, page_id, COUNT(*) as count, 
--        ARRAY_AGG(conversation_id ORDER BY last_message_time DESC) as conversation_ids
-- FROM facebook_conversations
-- GROUP BY participant_id, page_id
-- HAVING COUNT(*) > 1;

-- ============================================
-- STEP 2: Merge duplicate conversations
-- Keep the one with the most recent message and migrate messages
-- ============================================
DO $$
DECLARE
    dup RECORD;
    keep_conv_id TEXT;
    delete_conv_id TEXT;
BEGIN
    -- Find all duplicates
    FOR dup IN 
        SELECT participant_id, page_id
        FROM facebook_conversations
        GROUP BY participant_id, page_id
        HAVING COUNT(*) > 1
    LOOP
        -- Get the conversation to keep (most recent message)
        SELECT conversation_id INTO keep_conv_id
        FROM facebook_conversations
        WHERE participant_id = dup.participant_id 
          AND page_id = dup.page_id
        ORDER BY last_message_time DESC NULLS LAST
        LIMIT 1;

        -- For each duplicate to delete
        FOR delete_conv_id IN 
            SELECT conversation_id
            FROM facebook_conversations
            WHERE participant_id = dup.participant_id 
              AND page_id = dup.page_id
              AND conversation_id != keep_conv_id
        LOOP
            -- Move messages from duplicate to kept conversation
            UPDATE facebook_messages 
            SET conversation_id = keep_conv_id
            WHERE conversation_id = delete_conv_id;

            -- Delete the duplicate conversation
            DELETE FROM facebook_conversations 
            WHERE conversation_id = delete_conv_id;

            RAISE NOTICE 'Merged conversation % into % for participant %', 
                delete_conv_id, keep_conv_id, dup.participant_id;
        END LOOP;
    END LOOP;
END $$;

-- ============================================
-- STEP 3: Add unique constraint to prevent future duplicates
-- ============================================
-- First drop the existing index if it's not a unique constraint
DROP INDEX IF EXISTS idx_fb_conversations_participant_page;

-- Create a unique constraint on (participant_id, page_id)
-- This ensures one conversation per contact per page
ALTER TABLE facebook_conversations
ADD CONSTRAINT unique_participant_per_page 
UNIQUE (participant_id, page_id);

-- ============================================
-- STEP 4: Verify no duplicates remain
-- ============================================
-- SELECT participant_id, page_id, COUNT(*) as count
-- FROM facebook_conversations
-- GROUP BY participant_id, page_id
-- HAVING COUNT(*) > 1;
-- (Should return 0 rows)

-- ============================================
-- DONE: The unique constraint will now prevent
-- future duplicates from being inserted
-- ============================================
