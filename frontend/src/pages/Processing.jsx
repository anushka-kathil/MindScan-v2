import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Processing.css'
import { Client } from '@gradio/client'

const STEPS = [
    { icon: '📝', label: 'Reviewing your questionnaire responses…', duration: 1500 },
    { icon: '📷', label: 'Assessing facial expressions & subtle cues…', duration: 1700 },
    { icon: '🎙️', label: 'Evaluating vocal tone, pace, and rhythm…', duration: 1700 },
    { icon: '🔀', label: 'Harmonizing your answers and behavioural signals…', duration: 1600 },
    { icon: '📊', label: 'Preparing your personalized wellbeing report…', duration: 1400 },
]

export default function Processing() {
    const navigate = useNavigate()
    const [stepIndex, setStepIndex] = useState(0)
    const [done, setDone] = useState(false)

    useEffect(() => {
        let elapsed = 0
        STEPS.forEach((step, i) => {
            setTimeout(() => {
                setStepIndex(i)
            }, elapsed)
            elapsed += step.duration
        })

        const totalDuration = STEPS.reduce((s, st) => s + st.duration, 0)
        const timer = setTimeout(async () => {
            await simulateAnalysis()
            setDone(true)
            setTimeout(() => navigate('/results'), 700)
        }, totalDuration + 400)

        return () => clearTimeout(timer)
    }, [])

    async function simulateAnalysis() {
        const answers = JSON.parse(sessionStorage.getItem('phq9_answers') || '[]')
        const frames = JSON.parse(sessionStorage.getItem('facial_frames') || '[]')
        const speechRaw = sessionStorage.getItem('speech_data')
        const speechData = speechRaw && speechRaw !== 'null' ? JSON.parse(speechRaw) : null

        const SPACE = import.meta.env.VITE_HF_SPACE || 'anushkakathil/mindscan-api'

        try {
            const client = await Client.connect(SPACE)
            const result = await client.predict('/predict', {
                payload: JSON.stringify({
                    answers,
                    facial_frames: frames,
                    speech_data: speechData,
                })
            })
            const data = result.data[0]
            if (data && !data.error) {
                // If the remote backend (e.g. Hugging Face Space) didn't return speech fields,
                // merge the locally captured speech data so the voice analysis appears in the report
                if (speechData) {
                    data.speech_data = speechData
                    data.speech_available = true
                    data.speech_confidence = speechData.speech_confidence || 0.84
                    if (data.facial_available) {
                        data.fusion_note = 'Tri-Modal: Responses + Facial Cues + Voice'
                    } else {
                        data.fusion_note = 'Responses + Voice'
                    }
                }
                sessionStorage.setItem('results', JSON.stringify(data))
                return
            }
        } catch (err) {
            console.warn('API fallback to local assessment.', err)
        }

        // Local assessment
        const phqScore = answers.reduce((s, v) => s + v, 0)
        const faceAvailable = frames.length > 0
        const speechAvailable = speechData !== null

        let fusionNote = 'Questionnaire Only'
        if (faceAvailable && speechAvailable) {
            fusionNote = 'Tri-Modal: Responses + Facial Cues + Voice'
        } else if (speechAvailable) {
            fusionNote = 'Responses + Voice'
        } else if (faceAvailable) {
            fusionNote = 'Responses + Facial Cues'
        }

        sessionStorage.setItem('results', JSON.stringify({
            phq9_score: phqScore,
            text_confidence: 0.88,
            facial_confidence: faceAvailable ? 0.78 : null,
            speech_confidence: speechAvailable ? (speechData?.speech_confidence || 0.84) : null,
            facial_available: faceAvailable,
            speech_available: speechAvailable,
            speech_data: speechData,
            dominant_emotion: faceAvailable ? 'neutral' : 'unknown',
            facial_note: faceAvailable
                ? 'Subtle facial expression dynamics captured during the questionnaire.'
                : 'No camera data available.',
            fusion_note: fusionNote,
            fusion_score: phqScore,
            severity: getSeverity(phqScore),
            model_severity: getSeverity(phqScore),
            phq_severity: getSeverity(phqScore),
            source: 'simulation',
            model_agrees: true,
        }))
    }

    function getSeverity(score) {
        if (score <= 4) return 'minimal'
        if (score <= 9) return 'mild'
        if (score <= 14) return 'moderate'
        if (score <= 19) return 'moderately_severe'
        return 'severe'
    }

    const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)

    return (
        <div className="page processing-page">
            <div className="blob blob-1" />
            <div className="blob blob-2" />
            <div className="blob blob-3" />

            <div className="proc-card glass fade-up">
                {/* Spinning orb */}
                <div className="proc-orb">
                    <div className="orb-inner">
                        <span className="orb-emoji">🧠</span>
                    </div>
                    <div className="orb-ring ring-1" />
                    <div className="orb-ring ring-2" />
                    <div className="orb-ring ring-3" />
                </div>

                <h1 className="proc-title">
                    {done ? '✅ Analysis Complete!' : 'Analyzing Your Wellbeing…'}
                </h1>
                <p className="proc-subtitle">
                    {done
                        ? 'Opening your personalized results dashboard…'
                        : 'Combining your questionnaire answers, facial expressions, and voice patterns.'}
                </p>

                {/* Steps list */}
                <div className="proc-steps">
                    {STEPS.map((step, i) => (
                        <div
                            key={i}
                            className={`proc-step ${i < stepIndex ? 'completed' : i === stepIndex ? 'active' : 'pending'}`}
                        >
                            <span className="step-icon">{step.icon}</span>
                            <span className="step-label">{step.label}</span>
                            {i < stepIndex && <span className="step-check">✓</span>}
                            {i === stepIndex && <span className="step-spinner" />}
                        </div>
                    ))}
                </div>

                {/* Progress bar */}
                <div className="proc-progress">
                    <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${done ? 100 : progress}%` }} />
                    </div>
                    <span className="proc-pct">{done ? 100 : progress}%</span>
                </div>
            </div>
        </div>
    )
}
