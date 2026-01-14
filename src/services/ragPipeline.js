/**
 * RAG Pipeline Service
 * Retrieval-Augmented Generation for knowledge-based responses
 * Module 4 of the Enterprise AI Chatbot System
 */

import { getSupabaseClient } from './supabase';
import { nvidiaChat } from './aiService';

const getSupabase = () => {
    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase client not initialized');
    }
    return client;
};

/**
 * Query the knowledge base for relevant context
 * @param {string} query - User query to search for
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Relevant context
 */
export async function queryKnowledge(query, options = {}) {
    try {
        const db = getSupabase();
        const { limit = 5, minRelevance = 0.3 } = options;

        // Get all document chunks
        const { data: chunks, error } = await db
            .from('rag_chunks')
            .select(`
                *,
                document:document_id(title, metadata)
            `)
            .order('created_at', { ascending: false })
            .limit(100); // Get recent chunks

        if (error) throw error;

        if (!chunks || chunks.length === 0) {
            return {
                found: false,
                context: null,
                sources: [],
                fallbackUsed: true
            };
        }

        // Simple keyword-based relevance (vector search would be ideal)
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const scoredChunks = chunks.map(chunk => {
            const content = (chunk.content || '').toLowerCase();
            const title = (chunk.document?.title || '').toLowerCase();

            let score = 0;
            for (const word of queryWords) {
                if (content.includes(word)) score += 1;
                if (title.includes(word)) score += 0.5;
            }

            // Normalize score
            const normalizedScore = score / Math.max(queryWords.length, 1);

            return { ...chunk, relevanceScore: normalizedScore };
        });

        // Filter and sort by relevance
        const relevant = scoredChunks
            .filter(c => c.relevanceScore >= minRelevance)
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, limit);

        if (relevant.length === 0) {
            return {
                found: false,
                context: null,
                sources: [],
                fallbackUsed: true,
                queryWords
            };
        }

        // Combine relevant chunks into context
        const context = relevant
            .map(c => c.content)
            .join('\n\n---\n\n');

        const sources = relevant.map(c => ({
            documentId: c.document_id,
            title: c.document?.title || 'Unknown',
            snippet: c.content.substring(0, 100) + '...',
            relevance: c.relevanceScore
        }));

        return {
            found: true,
            context,
            sources,
            fallbackUsed: false,
            topRelevance: relevant[0]?.relevanceScore || 0
        };

    } catch (error) {
        console.error('[RAG] Error querying knowledge:', error);
        return {
            found: false,
            context: null,
            sources: [],
            fallbackUsed: true,
            error: error.message
        };
    }
}

/**
 * Get relevant context for a conversation
 * Analyzes recent messages and queries knowledge base
 * @param {string} conversationId - Conversation ID
 */
export async function getRelevantContext(conversationId) {
    try {
        const db = getSupabase();

        // Get recent messages
        const { data: messages } = await db
            .from('facebook_messages')
            .select('message_text, is_from_page')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: false })
            .limit(10);

        if (!messages || messages.length === 0) {
            return { context: null, sources: [] };
        }

        // Extract customer questions and topics
        const customerMessages = messages
            .filter(m => !m.is_from_page && m.message_text)
            .map(m => m.message_text);

        if (customerMessages.length === 0) {
            return { context: null, sources: [] };
        }

        // Build query from recent customer messages
        const query = customerMessages.slice(0, 3).join(' ');

        // Query knowledge base
        const result = await queryKnowledge(query);

        return {
            context: result.context,
            sources: result.sources,
            found: result.found
        };

    } catch (error) {
        console.error('[RAG] Error getting context:', error);
        return { context: null, sources: [] };
    }
}

/**
 * Index a document into the RAG system
 * @param {Object} document - Document to index
 */
export async function indexDocument(document) {
    try {
        const db = getSupabase();
        const { title, content, metadata = {}, userId = null } = document;

        if (!content || !title) {
            throw new Error('Document must have title and content');
        }

        // Create document record
        const { data: doc, error: docError } = await db
            .from('rag_documents')
            .insert({
                title,
                full_content: content,
                metadata,
                created_by: userId
            })
            .select()
            .single();

        if (docError) throw docError;

        // Split content into chunks
        const chunks = chunkContent(content);

        // Insert chunks
        const chunkRecords = chunks.map((chunk, index) => ({
            document_id: doc.id,
            content: chunk.text,
            chunk_index: index,
            start_pos: chunk.start,
            end_pos: chunk.end
        }));

        const { error: chunksError } = await db
            .from('rag_chunks')
            .insert(chunkRecords);

        if (chunksError) throw chunksError;

        // Update chunk count
        await db
            .from('rag_documents')
            .update({ chunk_count: chunks.length })
            .eq('id', doc.id);

        console.log(`[RAG] Indexed document "${title}" with ${chunks.length} chunks`);

        return {
            success: true,
            documentId: doc.id,
            chunkCount: chunks.length
        };

    } catch (error) {
        console.error('[RAG] Error indexing document:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Split content into chunks for indexing
 * @param {string} content - Content to chunk
 * @param {number} maxChunkSize - Maximum chunk size in characters
 */
function chunkContent(content, maxChunkSize = 1000) {
    const chunks = [];
    const paragraphs = content.split(/\n\n+/);

    let currentChunk = '';
    let currentStart = 0;

    for (const para of paragraphs) {
        if (currentChunk.length + para.length > maxChunkSize && currentChunk) {
            chunks.push({
                text: currentChunk.trim(),
                start: currentStart,
                end: currentStart + currentChunk.length
            });
            currentStart += currentChunk.length;
            currentChunk = '';
        }
        currentChunk += para + '\n\n';
    }

    if (currentChunk.trim()) {
        chunks.push({
            text: currentChunk.trim(),
            start: currentStart,
            end: currentStart + currentChunk.length
        });
    }

    // Ensure at least one chunk
    if (chunks.length === 0 && content.trim()) {
        chunks.push({
            text: content.trim(),
            start: 0,
            end: content.length
        });
    }

    return chunks;
}

/**
 * Delete a document and its chunks
 * @param {string} documentId - Document ID to delete
 */
export async function deleteDocument(documentId) {
    try {
        const db = getSupabase();

        // Chunks are deleted automatically via CASCADE
        const { error } = await db
            .from('rag_documents')
            .delete()
            .eq('id', documentId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('[RAG] Error deleting document:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get all documents in the knowledge base
 */
export async function getDocuments() {
    try {
        const db = getSupabase();

        const { data, error } = await db
            .from('rag_documents')
            .select('id, title, chunk_count, metadata, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];

    } catch (error) {
        console.error('[RAG] Error getting documents:', error);
        return [];
    }
}

/**
 * Fallback behavior when knowledge is not found
 * @param {string} query - The unanswered query
 * @param {Object} context - Conversation context
 */
export async function fallbackBehavior(query, context = {}) {
    const fallbackResponses = {
        noKnowledge: "I don't have specific information about that in my knowledge base. Let me connect you with someone who can help, or you can ask me about something else!",

        uncertain: "I'm not 100% certain about that specific detail. Would you like me to have someone from our team follow up with you directly?",

        partial: "I found some related information, but it might not fully answer your question. Here's what I know: {context}. Would you like more specific details from our team?",

        redirect: "That's a great question! For the most accurate answer, I'd recommend speaking with our team directly. Would you like me to schedule a call?"
    };

    // Determine best fallback
    if (context.hasPartialMatch) {
        return {
            type: 'partial',
            response: fallbackResponses.partial.replace('{context}', context.partialContext || ''),
            shouldEscalate: false
        };
    }

    if (context.isComplexQuestion) {
        return {
            type: 'redirect',
            response: fallbackResponses.redirect,
            shouldEscalate: true
        };
    }

    return {
        type: 'noKnowledge',
        response: fallbackResponses.noKnowledge,
        shouldEscalate: false
    };
}

/**
 * AI-enhanced context retrieval
 * Uses AI to understand query intent before searching
 */
export async function smartQueryKnowledge(query, conversationHistory = []) {
    // Use AI to extract key topics from query
    const extractPrompt = `Given this customer message, extract the main topic they're asking about. Return only the key topic/keywords, nothing else.

Message: "${query}"

Key topic:`;

    try {
        const topic = await nvidiaChat([
            { role: 'system', content: 'You are a topic extractor. Return only keywords, no explanation.' },
            { role: 'user', content: extractPrompt }
        ], { temperature: 0.1, maxTokens: 50 });

        if (topic) {
            // Query with extracted topic
            const result = await queryKnowledge(topic.trim());

            if (result.found) {
                return result;
            }
        }

        // Fallback to original query
        return await queryKnowledge(query);

    } catch (error) {
        console.error('[RAG] Smart query error:', error);
        return await queryKnowledge(query);
    }
}

export default {
    queryKnowledge,
    getRelevantContext,
    indexDocument,
    deleteDocument,
    getDocuments,
    fallbackBehavior,
    smartQueryKnowledge
};
