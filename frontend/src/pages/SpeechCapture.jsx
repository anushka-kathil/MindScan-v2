import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { CLINICAL_INTERVIEW_PROMPT, generateSpeechAnalysis } from '../services/speechAnalysis'
import './SpeechCapture.css'

const INITIAL_BARS = Array(28).fill(8)

export default function SpeechCapture() {
    const navigate = useNavigate()
    const [phase, setPhase] = useState('idle') // 'idle' | 'recording' | 'analysing' | 'done'
    const [timeLeft, setTimeLeft] = useState(CLINICAL_INTERVIEW_PROMPT.duration_seconds)
    const [transcript, setTranscript] = useState('')
    const [barHeights, setBarHeights] = useState(INITIAL_BARS)

    // Refs for Web Audio API & measurements
    const audioContextRef = useRef(null)
    const analyserRef = useRef(null)
    const mediaStreamRef = useRef(null)
    const animFrameRef = useRef(null)
    const timerRef = useRef(null)
    const recognitionRef = useRef(null)

    // Real measurement accumulators
    const measurementsRef = useRef({
        rmsList: [],
        silentFrames: 0,
        voicedFrames: 0,
        pauseCount: 0,
        inPause: false,
        pauseRunFrames: 0,
    })

    const phqScoreRef = useRef(0)
    const dominantEmotionRef = useRef('neutral')
    const elapsedSecondsRef = useRef(0)

    useEffect(() => {
        try {
            const rawAnswers = sessionStorage.getItem('phq9_answers')
            if (rawAnswers) {
                const arr = JSON.parse(rawAnswers)
                if (Array.isArray(arr)) {
                    phqScoreRef.current = arr.reduce((s, v) => s + (v || 0), 0)
                }
            }
            const rawResults = sessionStorage.getItem('results')
            if (rawResults) {
                const res = JSON.parse(rawResults)
                dominantEmotionRef.current = res?.dominant_emotion || 'neutral'
            }
        } catch (e) {
            console.warn('Session read:', e)
        }

        // Web Speech API for genuine word counting
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
        if (SpeechRec) {
            try {
                const recog = new SpeechRec()
                recog.continuous = true
                recog.interimResults = true
                recog.lang = 'en-US'

                recog.onresult = (event) => {
                    let current = ''
                    for (let i = 0; i < event.results.length; i++) {
                        current += event.results[i][0].transcript + ' '
                    }
                    setTranscript(current.trim())
                }

                recognitionRef.current = recog
            } catch (err) {
                console.warn('Speech rec:', err)
            }
        }

        return () => {
            cleanupAudio()
        }
    }, [])

    const cleanupAudio = () => {
        if (timerRef.current) clearInterval(timerRef.current)
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch {}
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop())
            mediaStreamRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {})
            audioContextRef.current = null
        }
    }

    // Audio sampling loop (runs at 60fps while recording)
    const sampleAudio = useCallback(() => {
        if (!analyserRef.current) return

        const analyser = analyserRef.current
        const timeData = new Uint8Array(analyser.fftSize)
        const freqData = new Uint8Array(analyser.frequencyBinCount)

        analyser.getByteTimeDomainData(timeData)
        analyser.getByteFrequencyData(freqData)

        // 1. Calculate Real RMS (Volume / Energy)
        let sum = 0
        for (let i = 0; i < timeData.length; i++) {
            const norm = (timeData[i] - 128) / 128
            sum += norm * norm
        }
        const rms = Math.sqrt(sum / timeData.length)
        measurementsRef.current.rmsList.push(rms)

        // 2. Real-time Voice Activity Detection (VAD)
        // Background noise is typically < 0.02. Active speech is > 0.025
        const isSpeaking = rms > 0.022
        if (isSpeaking) {
            measurementsRef.current.voicedFrames += 1
            if (measurementsRef.current.inPause && measurementsRef.current.pauseRunFrames > 6) {
                // Detected end of a natural pause (>200ms)
                measurementsRef.current.pauseCount += 1
            }
            measurementsRef.current.inPause = false
            measurementsRef.current.pauseRunFrames = 0
        } else {
            measurementsRef.current.silentFrames += 1
            measurementsRef.current.pauseRunFrames += 1
            if (measurementsRef.current.pauseRunFrames > 6) {
                measurementsRef.current.inPause = true
            }
        }

        // 3. Drive Real 28-Bar Waveform from actual frequency spectrum
        const step = Math.floor(freqData.length / 32)
        const newBars = []
        for (let i = 0; i < 28; i++) {
            const val = freqData[i * step] || 0
            // Map 0-255 byte value to 6px - 100px bar height
            const height = Math.max(6, Math.round((val / 255) * 95))
            newBars.push(height)
        }
        setBarHeights(newBars)

        animFrameRef.current = requestAnimationFrame(sampleAudio)
    }, [])

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            mediaStreamRef.current = stream

            const AudioCtx = window.AudioContext || window.webkitAudioContext
            const audioCtx = new AudioCtx()
            audioContextRef.current = audioCtx

            const source = audioCtx.createMediaStreamSource(stream)
            const analyser = audioCtx.createAnalyser()
            analyser.fftSize = 1024
            analyser.smoothingTimeConstant = 0.75
            source.connect(analyser)
            analyserRef.current = analyser

            // Reset measurements
            measurementsRef.current = {
                rmsList: [],
                silentFrames: 0,
                voicedFrames: 0,
                pauseCount: 0,
                inPause: false,
                pauseRunFrames: 0,
            }

            elapsedSecondsRef.current = 0
            setTranscript('')
            setTimeLeft(CLINICAL_INTERVIEW_PROMPT.duration_seconds)
            setPhase('recording')

            // Start speech recognition
            if (recognitionRef.current) {
                try { recognitionRef.current.start() } catch {}
            }

            // Start audio visualizer & analysis loop
            animFrameRef.current = requestAnimationFrame(sampleAudio)

            // Countdown timer
            timerRef.current = setInterval(() => {
                elapsedSecondsRef.current += 1
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current)
                        timerRef.current = null
                        stopRecording()
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        } catch (err) {
            console.warn('Microphone access denied:', err)
            alert('Please allow microphone access to record your voice check-in.')
        }
    }

    const stopRecording = useCallback(() => {
        cleanupAudio()
        setPhase('analysing')

        setTimeout(() => {
            const duration = Math.max(1, elapsedSecondsRef.current || 1)
            const m = measurementsRef.current

            // 1. Calculate Real Measured Speaking Pace (WPM)
            const words = transcript.trim().split(/\s+/).filter(Boolean)
            let wordCount = words.length
            // Fallback estimation if speech recognition isn't supported in browser:
            // average speaking rate is ~2.2 syllables per voiced second
            if (wordCount === 0 && m.voicedFrames > 20) {
                wordCount = Math.round((m.voicedFrames / 60) * 2.2)
            }
            const measuredWpm = Math.round((wordCount / duration) * 60)

            // 2. Calculate Real Silence Ratio %
            const totalFrames = m.silentFrames + m.voicedFrames || 1
            const realSilencePct = Math.round((m.silentFrames / totalFrames) * 100)

            // 3. Calculate Real Average Vocal Volume / RMS
            const avgRms = m.rmsList.length > 0
                ? m.rmsList.reduce((a, b) => a + b, 0) / m.rmsList.length
                : 0.05

            // 4. Calculate RMS Variance (fluctuation vs monotone)
            const variance = m.rmsList.length > 0
                ? m.rmsList.reduce((a, b) => a + Math.pow(b - avgRms, 2), 0) / m.rmsList.length
                : 0.001

            // Compile genuine live measurements
            const realMeasurements = {
                wpm: measuredWpm,
                silence_ratio_pct: realSilencePct,
                pause_count: m.pauseCount,
                avg_rms: avgRms,
                rms_variance: variance,
                word_count: wordCount,
            }

            const analysis = generateSpeechAnalysis({
                phq9Score: phqScoreRef.current,
                dominantEmotion: dominantEmotionRef.current,
                durationRecorded: duration,
                measured: realMeasurements,
            })

            sessionStorage.setItem('speech_data', JSON.stringify(analysis))
            setPhase('done')

            setTimeout(() => {
                navigate('/processing')
            }, 600)
        }, 1300)
    }, [navigate, transcript])

    const handleSkip = () => {
        cleanupAudio()
        sessionStorage.setItem('speech_data', 'null')
        navigate('/processing')
    }

    const timerFormatted = `00:${timeLeft.toString().padStart(2, '0')}`
    const isRecording = phase === 'recording'
    const isAnalysing = phase === 'analysing'
    const isDone = phase === 'done'

    return (
        <div className="page speech-page">
            <div className="blob blob-1" />

            {/* Header */}
            <header className="sp-header">
                <span className="sp-logo">MindScan</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <span className="sp-progress-label">Step 2 of 2: Voice Check-In</span>
                    <div className="sp-progress-bar">
                        <div className="sp-progress-fill" style={{ width: '100%' }} />
                    </div>
                </div>
            </header>

            {/* Main Body */}
            <div className="sp-body">
                {/* Left: Conversational Prompt & Recording */}
                <div className="sp-panel-left">
                    <div className="sp-step-tag">Live Voice Assessment</div>

                    {/* Conversational Question */}
                    <div className="sp-prompt-card">
                        <h1 className="sp-question-text">
                            "In your own words, how have you been feeling over the past couple of weeks?"
                        </h1>
                        <p className="sp-guidance-text">
                            Take 20 to 30 seconds to talk about your energy, sleep, or whatever has been on your mind. Speak at your natural pace, there are no right or wrong answers.
                        </p>
                    </div>

                    {/* Live Transcript Box */}
                    <div className="sp-transcript-box">
                        <span className="sp-transcript-label">
                            {isRecording ? '🎙️ Listening to your voice…' : 'Your Spoken Response'}
                        </span>
                        <p className="sp-transcript-text">
                            {transcript ? (
                                `"${transcript}"`
                            ) : isRecording ? (
                                <span style={{ opacity: 0.6 }}>Listening live… speak at your natural pace.</span>
                            ) : isAnalysing ? (
                                <span style={{ color: 'var(--clr-accent)' }}>Analyzing your real speaking pace, loudness, and pauses…</span>
                            ) : isDone ? (
                                <span style={{ color: '#34d399' }}>✓ Voice response captured.</span>
                            ) : (
                                <span style={{ opacity: 0.5 }}>Tap the microphone below when you are ready to speak.</span>
                            )}
                        </p>
                    </div>

                    {/* Recording Area */}
                    <div className="sp-mic-section">
                        <div className={`sp-timer ${isRecording ? 'recording' : isDone ? 'done' : ''}`}>
                            {timerFormatted}
                        </div>

                        <button
                            id="speech-record-btn"
                            className={`sp-mic-btn ${isRecording ? 'active' : ''}`}
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={isAnalysing || isDone}
                            title={isRecording ? 'Finish Speaking' : 'Start Recording'}
                        >
                            {isRecording ? (
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="5" y="5" width="14" height="14" rx="3" />
                                </svg>
                            ) : (
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                    <line x1="12" y1="19" x2="12" y2="22" />
                                </svg>
                            )}
                        </button>

                        <span className="sp-status-text">
                            {phase === 'idle' && 'Tap the microphone to start'}
                            {isRecording && '● Listening... tap button when finished'}
                            {isAnalysing && 'Analyzing your vocal tone and pauses…'}
                            {isDone && '✓ Done! Moving to your report'}
                        </span>
                    </div>

                    {/* Nav Controls */}
                    <div className="sp-nav">
                        <button className="btn-ghost" onClick={() => navigate('/questionnaire')}>
                            ← Back to Questions
                        </button>
                        <button
                            className="btn-primary"
                            onClick={isRecording ? stopRecording : startRecording}
                            disabled={isAnalysing || isDone}
                            style={{ flex: 1 }}
                        >
                            {isRecording
                                ? 'Finish & See Results →'
                                : isAnalysing || isDone
                                ? 'Processing…'
                                : 'Start Recording 🎙️'}
                        </button>
                    </div>

                    <button className="sp-skip-link" onClick={handleSkip}>
                        Skip voice check-in (calculate results using questionnaire & face only)
                    </button>
                </div>

                {/* Right: Real-time Audio Waveform & Gentle Tips */}
                <div className="sp-panel-right">
                    <span className="sp-side-title">Live Microphone Visualizer</span>

                    {/* Waveform Visualizer Driven by Real Voice Frequencies */}
                    <div className="sp-wave-box">
                        {barHeights.map((h, i) => (
                            <div
                                key={i}
                                className={`sp-wave-bar ${isRecording ? 'active' : isDone ? 'done' : 'idle'}`}
                                style={{ height: `${h}px` }}
                            />
                        ))}
                    </div>

                    {/* Advice for the Patient */}
                    <div className="sp-tips-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 16 }}>🌿</span>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--clr-primary)' }}>
                                How to Approach This Task
                            </span>
                        </div>

                        <div className="sp-tip-item">
                            <span className="sp-tip-bullet">●</span>
                            <p><strong>Speak in your everyday voice:</strong> Talk as if you're speaking with a trusted friend. No need to sound formal or force a particular tone.</p>
                        </div>
                        <div className="sp-tip-item">
                            <span className="sp-tip-bullet">●</span>
                            <p><strong>Take your time and pause:</strong> There is no rush to speak continuously. Pausing to gather your thoughts or taking a breath is completely natural.</p>
                        </div>
                        <div className="sp-tip-item">
                            <span className="sp-tip-bullet">●</span>
                            <p><strong>Share whatever feels comfortable:</strong> You can touch upon your energy levels, sleep quality, daily routine, or anything on your mind lately.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
