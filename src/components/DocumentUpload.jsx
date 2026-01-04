// Document Upload Component for RAG Pipeline
import React, { useState, useEffect } from 'react';
import { getSupabaseClient } from '../services/supabase';

// Simple text chunking function
const chunkText = (text, chunkSize = 500, overlap = 50) => {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push({
            content: text.slice(start, end),
            start,
            end
        });
        start = end - overlap;
        if (start < 0) start = 0;
        if (end >= text.length) break;
    }

    return chunks;
};

const DocumentUpload = ({ onClose }) => {
    const [documents, setDocuments] = useState([]);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        const client = getSupabaseClient();
        if (!client) return;

        const { data } = await client
            .from('rag_documents')
            .select('id, title, created_at, chunk_count')
            .order('created_at', { ascending: false });

        setDocuments(data || []);
    };

    const handleUpload = async () => {
        if (!title.trim() || !content.trim()) {
            setError('Please enter both title and content');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const client = getSupabaseClient();
            if (!client) throw new Error('Database not available');

            // Create document
            const { data: doc, error: docError } = await client
                .from('rag_documents')
                .insert({
                    title: title.trim(),
                    full_content: content.trim(),
                    chunk_count: 0
                })
                .select()
                .single();

            if (docError) throw docError;

            // Chunk the content
            const chunks = chunkText(content.trim());

            // Insert chunks
            const { error: chunkError } = await client
                .from('rag_chunks')
                .insert(chunks.map((chunk, index) => ({
                    document_id: doc.id,
                    content: chunk.content,
                    chunk_index: index,
                    start_pos: chunk.start,
                    end_pos: chunk.end
                })));

            if (chunkError) throw chunkError;

            // Update chunk count
            await client
                .from('rag_documents')
                .update({ chunk_count: chunks.length })
                .eq('id', doc.id);

            setTitle('');
            setContent('');
            await loadDocuments();
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        const client = getSupabaseClient();
        if (!client) return;

        // Delete chunks first (cascade)
        await client.from('rag_chunks').delete().eq('document_id', id);
        await client.from('rag_documents').delete().eq('id', id);
        await loadDocuments();
    };

    return (
        <div className="modal-overlay active">
            <div className="modal" style={{ maxWidth: '700px' }}>
                <div className="modal-header">
                    <h3 className="modal-title">📄 Knowledge Base Documents</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {error && (
                        <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderRadius: '8px', marginBottom: '1rem' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {/* Upload form */}
                        <div>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>Add Document</h4>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label">Title</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g., Product Pricing, Company Info..."
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                                <label className="form-label">Content</label>
                                <textarea
                                    className="form-input"
                                    rows={8}
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder="Paste your business information, product details, pricing, FAQs, etc..."
                                />
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleUpload}
                                disabled={loading}
                                style={{ width: '100%' }}
                            >
                                {loading ? 'Uploading...' : 'Add to Knowledge Base'}
                            </button>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Documents are split into chunks for AI retrieval. Add company info, product details, pricing, and FAQs.
                            </p>
                        </div>

                        {/* Document list */}
                        <div>
                            <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                                Documents ({documents.length})
                            </h4>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                {documents.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No documents yet. Add your first document to enable AI knowledge.
                                    </div>
                                ) : (
                                    documents.map(doc => (
                                        <div
                                            key={doc.id}
                                            style={{
                                                padding: '0.75rem',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: '8px',
                                                marginBottom: '0.5rem',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: '500' }}>{doc.title}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {doc.chunk_count} chunks • {new Date(doc.created_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                onClick={() => handleDelete(doc.id)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentUpload;
