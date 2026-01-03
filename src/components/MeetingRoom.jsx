// MeetingRoom.jsx - Video call room with live captions
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../services/supabase';
import { useSpeechCaptions } from '../hooks/useSpeechCaptions';

// Throttle helper
const createThrottle = (ms) => {
    let last = 0;
    return () => {
        const now = Date.now();
        if (now - last > ms) {
            last = now;
            return true;
        }
        return false;
    };
};

// Guest name entry modal
const GuestNameModal = ({ onSubmit }) => {
    const [name, setName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            onSubmit(name.trim());
        }
    };

    return (
        <div className="modal-overlay active" style={{ zIndex: 1100 }}>
            <div className="modal" style={{ maxWidth: '400px', margin: 'auto' }}>
                <div className="modal-header">
                    <h3>Join Meeting</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                            Enter your name to join the meeting
                        </p>
                        <div className="form-group">
                            <label className="form-label">Your Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Enter your name..."
                                autoFocus
                                required
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
                            Join Meeting
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const MeetingRoom = ({
    roomSlug,
    roomId,
    currentUser,
    onClose,
    onRoomNotFound
}) => {
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [transcripts, setTranscripts] = useState([]);
    const [liveTexts, setLiveTexts] = useState({});
    const [captionsEnabled, setCaptionsEnabled] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    const [showCaptions, setShowCaptions] = useState(true);
    const [guestName, setGuestName] = useState(null);
    const [needsGuestName, setNeedsGuestName] = useState(false);
    const [myParticipantId, setMyParticipantId] = useState(null);

    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const throttleInterimRef = useRef(createThrottle(800));
    const supabaseChannelRef = useRef(null);

    // Determine display name
    const isGuest = !currentUser?.id;
    const displayName = isGuest ? guestName : (currentUser?.name || currentUser?.email?.split('@')[0] || 'User');
    const odId = currentUser?.id || `guest_${Date.now()}`;

    // Check if guest needs to enter name
    useEffect(() => {
        if (isGuest && !guestName) {
            setNeedsGuestName(true);
        }
    }, [isGuest, guestName]);

    // Load room data
    useEffect(() => {
        if (needsGuestName) return; // Wait for guest name
        loadRoom();
        return () => {
            cleanup();
        };
    }, [roomSlug, roomId, needsGuestName]);

    const loadRoom = async () => {
        const client = getSupabaseClient();
        if (!client) {
            setError('Database connection not available');
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            let query = client.from('meeting_rooms').select('*');

            if (roomId) {
                query = query.eq('id', roomId);
            } else if (roomSlug) {
                query = query.eq('room_slug', roomSlug);
            } else {
                throw new Error('No room identifier');
            }

            const { data, error } = await query.single();

            if (error || !data) {
                onRoomNotFound?.();
                setError('Room not found');
                return;
            }

            setRoom(data);
            await joinRoom(data.id);
            await subscribeToRoom(data.id);
            await loadTranscripts(data.id);

        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const joinRoom = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        // First, mark any old entries from this user as inactive (fix duplicate issue)
        if (currentUser?.id) {
            await client.from('room_participants')
                .update({ is_active: false, left_at: new Date().toISOString() })
                .eq('room_id', roomId)
                .eq('user_id', currentUser.id)
                .eq('is_active', true);
        }

        // Add self to participants
        const { data } = await client.from('room_participants').insert({
            room_id: roomId,
            user_id: currentUser?.id || null,
            display_name: displayName,
            peer_id: odId,
            is_active: true
        }).select().single();

        if (data) {
            setMyParticipantId(data.id);
        }

        // Update room status to active if scheduled
        await client.from('meeting_rooms')
            .update({ status: 'active' })
            .eq('id', roomId)
            .eq('status', 'scheduled');
    };

    const subscribeToRoom = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        const channel = client.channel(`room:${roomId}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'transcript_events', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    const event = payload.new;
                    if (event.is_final) {
                        setTranscripts(prev => [...prev, event]);
                        setLiveTexts(prev => {
                            const next = { ...prev };
                            delete next[event.user_id];
                            return next;
                        });
                    } else {
                        setLiveTexts(prev => ({
                            ...prev,
                            [event.user_id]: { text: event.text, name: event.display_name }
                        }));
                    }
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${roomId}` },
                () => {
                    loadParticipants(roomId);
                }
            )
            .subscribe();

        supabaseChannelRef.current = channel;
        await loadParticipants(roomId);
    };

    const loadParticipants = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        const { data } = await client
            .from('room_participants')
            .select('*')
            .eq('room_id', roomId)
            .eq('is_active', true)
            .order('joined_at', { ascending: true });

        setParticipants(data || []);
    };

    const loadTranscripts = async (roomId) => {
        const client = getSupabaseClient();
        if (!client) return;

        const { data } = await client
            .from('transcript_events')
            .select('*')
            .eq('room_id', roomId)
            .eq('is_final', true)
            .order('created_at', { ascending: true })
            .limit(100);

        setTranscripts(data || []);
    };

    const cleanup = async () => {
        // Stop local stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Leave room - mark my participant as inactive
        if (myParticipantId) {
            const client = getSupabaseClient();
            if (client) {
                await client.from('room_participants')
                    .update({ is_active: false, left_at: new Date().toISOString() })
                    .eq('id', myParticipantId);
            }
        }

        // Unsubscribe
        if (supabaseChannelRef.current) {
            supabaseChannelRef.current.unsubscribe();
        }
    };

    // Start local video (camera is optional)
    const startLocalVideo = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
        } catch (e) {
            console.warn('Failed to get video, trying audio only:', e);
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true
                });
                localStreamRef.current = audioStream;
                setIsVideoOff(true);
            } catch (audioError) {
                console.warn('No media devices available:', audioError);
                setIsVideoOff(true);
                setIsMuted(true);
            }
        }
    };

    useEffect(() => {
        if (room && !loading && !needsGuestName) {
            startLocalVideo();
        }
    }, [room, loading, needsGuestName]);

    // Toggle mute
    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        } else {
            setIsMuted(!isMuted);
        }
    };

    // Toggle video
    const toggleVideo = () => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            } else {
                setIsVideoOff(true);
            }
        } else {
            setIsVideoOff(!isVideoOff);
        }
    };

    // Speech recognition handlers
    const handleInterimSpeech = useCallback(async (text) => {
        if (!throttleInterimRef.current()) return;
        if (!room?.id) return;

        const client = getSupabaseClient();
        if (!client) return;

        await client.from('transcript_events').insert({
            room_id: room.id,
            user_id: currentUser?.id || null,
            display_name: displayName,
            text,
            is_final: false
        });
    }, [room?.id, currentUser?.id, displayName]);

    const handleFinalSpeech = useCallback(async (text) => {
        if (!room?.id) return;

        const client = getSupabaseClient();
        if (!client) return;

        await client.from('transcript_events').insert({
            room_id: room.id,
            user_id: currentUser?.id || null,
            display_name: displayName,
            text,
            is_final: true
        });
    }, [room?.id, currentUser?.id, displayName]);

    const { isSupported, isListening, error: speechError, interim } = useSpeechCaptions({
        enabled: captionsEnabled,
        language: 'en-US',
        onInterim: handleInterimSpeech,
        onFinal: handleFinalSpeech
    });

    // Leave room
    const handleLeave = async () => {
        await cleanup();
        onClose?.();
    };

    // Copy room link
    const copyRoomLink = () => {
        const link = `${window.location.origin}/room/${room?.room_slug}`;
        navigator.clipboard.writeText(link);
        alert('Room link copied!');
    };

    // Handle guest name submit
    const handleGuestNameSubmit = (name) => {
        setGuestName(name);
        setNeedsGuestName(false);
    };

    // Show guest name modal
    if (needsGuestName) {
        return <GuestNameModal onSubmit={handleGuestNameSubmit} />;
    }

    if (loading) {
        return (
            <div className="modal-overlay active">
                <div className="modal" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div>Loading meeting room...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="modal-overlay active">
                <div className="modal" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>❌ {error}</div>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
            </div>
        );
    }

    // Get status color
    const getStatusColor = (status) => {
        switch (status) {
            case 'active': return '#22c55e';
            case 'scheduled': return '#3b82f6';
            case 'ended': return '#6b7280';
            default: return '#6b7280';
        }
    };

    // Check if participant is me
    const isMe = (p) => p.id === myParticipantId;

    return (
        <div className="modal-overlay active" style={{ background: 'rgba(0,0,0,0.95)' }}>
            <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{room?.title}</h2>
                            <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.7rem',
                                background: getStatusColor(room?.status),
                                color: 'white',
                                textTransform: 'uppercase',
                                fontWeight: '600'
                            }}>
                                {room?.status === 'active' ? '● LIVE' : room?.status}
                            </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {participants.length} participant{participants.length !== 1 ? 's' : ''} • Joined as <strong>{displayName}</strong>
                            {isGuest && <span style={{ color: 'var(--warning)' }}> (Guest)</span>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={copyRoomLink} title="Copy link">
                            🔗 Share
                        </button>
                        <button className="btn btn-danger" onClick={handleLeave}>
                            Leave
                        </button>
                    </div>
                </div>

                {/* Main content */}
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* Video area */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem' }}>
                        {/* Video grid */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', alignContent: 'start', overflow: 'auto' }}>
                            {/* Local video - always show first */}
                            <div style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', border: '2px solid var(--primary)' }}>
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: isVideoOff ? 'none' : 'block' }}
                                />
                                {isVideoOff && (
                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}>
                                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>
                                            {displayName.charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                )}
                                <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: 'var(--primary)' }}>●</span>
                                    {displayName} (You) {isMuted && '🔇'}
                                </div>
                            </div>

                            {/* Other participants */}
                            {participants.filter(p => !isMe(p)).map(p => (
                                <div key={p.id} style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', color: 'white' }}>
                                        {(p.display_name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.7)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                                        {p.display_name || 'User'} {p.is_muted && '🔇'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem 0' }}>
                            <button
                                className={`btn ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={toggleMute}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                                title={isMuted ? 'Unmute' : 'Mute'}
                            >
                                {isMuted ? '🔇' : '🎤'}
                            </button>
                            <button
                                className={`btn ${isVideoOff ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={toggleVideo}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                            >
                                {isVideoOff ? '📷' : '🎥'}
                            </button>
                            <button
                                className={`btn ${captionsEnabled ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setCaptionsEnabled(!captionsEnabled)}
                                disabled={!isSupported}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                                title={isSupported ? (captionsEnabled ? 'Stop captions' : 'Start captions') : 'Captions not supported'}
                            >
                                💬
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowCaptions(!showCaptions)}
                                style={{ padding: '1rem', borderRadius: '50%', width: '60px', height: '60px' }}
                                title={showCaptions ? 'Hide transcript' : 'Show transcript'}
                            >
                                📜
                            </button>
                        </div>
                    </div>

                    {/* Captions panel */}
                    {showCaptions && (
                        <div style={{ width: '350px', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>💬 Live Captions</span>
                                {captionsEnabled && isListening && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>● Recording</span>}
                            </div>

                            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                                {/* Final transcripts */}
                                {transcripts.map((t, i) => (
                                    <div key={t.id || i} style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {t.display_name}
                                        </div>
                                        <div style={{ fontSize: '0.875rem' }}>{t.text}</div>
                                    </div>
                                ))}

                                {/* Live texts from others */}
                                {Object.entries(liveTexts).map(([uid, data]) => (
                                    <div key={uid} style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            {data.name} <span style={{ color: 'var(--warning)' }}>(typing...)</span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{data.text}</div>
                                    </div>
                                ))}

                                {/* My interim */}
                                {captionsEnabled && interim && (
                                    <div style={{ marginBottom: '0.75rem', opacity: 0.7 }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                            You <span style={{ color: 'var(--success)' }}>(speaking...)</span>
                                        </div>
                                        <div style={{ fontSize: '0.875rem', fontStyle: 'italic' }}>{interim}</div>
                                    </div>
                                )}

                                {transcripts.length === 0 && !interim && Object.keys(liveTexts).length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                        {captionsEnabled
                                            ? 'Start speaking to see captions...'
                                            : 'Enable captions to see live transcription'}
                                    </div>
                                )}
                            </div>

                            {speechError && (
                                <div style={{ padding: '0.75rem', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', fontSize: '0.75rem' }}>
                                    ⚠️ {speechError}
                                </div>
                            )}

                            {!isSupported && (
                                <div style={{ padding: '0.75rem', background: 'rgba(251,191,36,0.1)', color: 'var(--warning)', fontSize: '0.75rem' }}>
                                    ⚠️ Your browser doesn't support live captions (try Chrome/Edge)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingRoom;
