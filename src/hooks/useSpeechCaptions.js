// useSpeechCaptions.js - Web Speech API hook for live captions
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

export function useSpeechCaptions(opts = {}) {
    const {
        enabled = false,
        language = 'en-US',
        onInterim,
        onFinal
    } = opts;

    const [isSupported, setIsSupported] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState(null);
    const [interim, setInterim] = useState('');
    const [finals, setFinals] = useState([]);

    const recognitionRef = useRef(null);
    const restartRef = useRef(true);
    const onInterimRef = useRef(onInterim);
    const onFinalRef = useRef(onFinal);

    // Keep callbacks fresh
    useEffect(() => {
        onInterimRef.current = onInterim;
        onFinalRef.current = onFinal;
    }, [onInterim, onFinal]);

    // Check support on mount
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        setIsSupported(Boolean(SpeechRecognition));
    }, []);

    // Main recognition effect
    useEffect(() => {
        if (!isSupported) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        // Create recognition instance once
        if (!recognitionRef.current) {
            const rec = new SpeechRecognition();
            rec.continuous = true;
            rec.interimResults = true;
            rec.lang = language;

            rec.onstart = () => {
                setIsListening(true);
                setError(null);
            };

            rec.onerror = (event) => {
                const errorMessages = {
                    'no-speech': 'No speech detected',
                    'audio-capture': 'No microphone found',
                    'not-allowed': 'Microphone permission denied',
                    'network': 'Network error',
                    'aborted': 'Recognition aborted'
                };
                setError(errorMessages[event.error] || event.error);

                // Don't restart on permission error
                if (event.error === 'not-allowed') {
                    restartRef.current = false;
                }
            };

            rec.onresult = (event) => {
                let interimText = '';
                const finalChunks = [];

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const text = result[0]?.transcript ?? '';

                    if (result.isFinal) {
                        finalChunks.push(text.trim());
                    } else {
                        interimText += text;
                    }
                }

                // Update interim
                if (interimText.trim()) {
                    setInterim(interimText.trim());
                    onInterimRef.current?.(interimText.trim());
                } else if (finalChunks.length) {
                    setInterim('');
                }

                // Update finals
                if (finalChunks.length) {
                    setFinals(prev => [...prev, ...finalChunks]);
                    finalChunks.forEach(text => onFinalRef.current?.(text));
                    setInterim('');
                }
            };

            rec.onend = () => {
                setIsListening(false);

                // Auto-restart if still enabled
                if (restartRef.current) {
                    try {
                        rec.start();
                    } catch (e) {
                        // Retry after delay
                        setTimeout(() => {
                            try { rec.start(); } catch { }
                        }, 300);
                    }
                }
            };

            recognitionRef.current = rec;
        }

        const rec = recognitionRef.current;
        restartRef.current = enabled;

        if (enabled) {
            rec.lang = language;
            try {
                rec.start();
            } catch (e) {
                // Ignore if already started
            }
        } else {
            try {
                rec.stop();
            } catch { }
            setInterim('');
        }

        return () => {
            restartRef.current = false;
            try {
                recognitionRef.current?.stop();
            } catch { }
        };
    }, [enabled, language, isSupported]);

    // Clear transcript
    const clearTranscript = useCallback(() => {
        setFinals([]);
        setInterim('');
    }, []);

    // Full text combining finals and interim
    const fullText = useMemo(() => {
        const f = finals.join(' ').trim();
        if (!interim) return f;
        return `${f} ${interim}`.trim();
    }, [finals, interim]);

    return {
        isSupported,
        isListening,
        error,
        interim,
        finals,
        fullText,
        clearTranscript
    };
}

export default useSpeechCaptions;
