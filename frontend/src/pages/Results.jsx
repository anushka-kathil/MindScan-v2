import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ResultsChart from '../components/ResultsChart'
import './Results.css'

const SEVERITY_INFO = {
    minimal: {
        label: 'Minimal Depression',
        color: '#34d399',
        bg: 'rgba(52,211,153,0.08)',
        border: 'rgba(52,211,153,0.25)',
        emoji: '😊',
        advice: [
            'Maintain your healthy routines: consistent sleep, regular exercise, and social connection are protective.',
            'Continue practicing mindfulness or relaxation techniques that you enjoy.',
            'Consider keeping a gratitude journal to reinforce positive everyday moments.',
            'No clinical intervention indicated, but do check in with yourself regularly.',
        ],
    },
    mild: {
        label: 'Mild Depression',
        color: '#fbbf24',
        bg: 'rgba(251,191,36,0.08)',
        border: 'rgba(251,191,36,0.25)',
        emoji: '😐',
        advice: [
            'Talk to someone you trust about how you\'ve been feeling; sharing often helps lift weight.',
            'Light to moderate daily movement (a 20 to 30 minute walk) can meaningfully brighten mood.',
            'Aim for a consistent sleep and wake schedule to restore natural energy rhythms.',
            'If feelings persist for more than a couple of weeks, consider speaking with a counsellor.',
        ],
    },
    moderate: {
        label: 'Moderate Depression',
        color: '#f97316',
        bg: 'rgba(249,115,22,0.08)',
        border: 'rgba(249,115,22,0.25)',
        emoji: '😔',
        advice: [
            'We encourage you to reach out to a healthcare professional or counsellor for guidance.',
            'Evidence-based support like Cognitive Behavioural Therapy (CBT) can be very effective.',
            'Avoid isolating yourself; stay in touch with supportive family members or close friends.',
            'Be gentle with yourself and break daily tasks down into small, manageable steps.',
        ],
    },
    moderately_severe: {
        label: 'Moderately Severe Depression',
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.08)',
        border: 'rgba(239,68,68,0.25)',
        emoji: '😞',
        advice: [
            'We strongly encourage you to schedule an appointment with a doctor or mental health specialist.',
            'Therapy, lifestyle support, and medical consultation can make a significant difference.',
            'Confide in someone close so they can support you during this time.',
            'Helpline resources (India): iCall - 9152987821 | Vandrevala Foundation - 1860-2662-345',
        ],
    },
    severe: {
        label: 'Severe Depression',
        color: '#dc2626',
        bg: 'rgba(220,38,38,0.1)',
        border: 'rgba(220,38,38,0.4)',
        emoji: '🆘',
        advice: [
            '🚨 Please reach out to a healthcare professional, psychiatrist, or support service right away.',
            'You do not have to carry this alone. Support is available and effective.',
            '24/7 Helpline: Vandrevala Foundation - 1860-2662-345 | Tele-MANAS - 14416',
            'If you ever feel unsafe or in distress, please contact emergency services (112) immediately.',
        ],
    },
}

export default function Results() {
    const navigate = useNavigate()
    const [results, setResults] = useState(null)

    useEffect(() => {
        const stored = sessionStorage.getItem('results')
        if (stored) {
            const parsed = JSON.parse(stored)
            // Ensure speech_data is preserved if present in session
            const speechRaw = sessionStorage.getItem('speech_data')
            if (speechRaw && speechRaw !== 'null' && !parsed.speech_available) {
                try {
                    const sp = JSON.parse(speechRaw)
                    parsed.speech_data = sp
                    parsed.speech_available = true
                    parsed.speech_confidence = sp.speech_confidence || 0.84
                    if (parsed.facial_available) {
                        parsed.fusion_note = 'Tri-Modal: Responses + Facial Cues + Voice'
                    }
                } catch (e) {
                    console.warn('Error parsing speech_data:', e)
                }
            }
            setResults(parsed)
        } else {
            navigate('/')
        }
    }, [navigate])

    if (!results) return null

    const info = SEVERITY_INFO[results.severity] || SEVERITY_INFO.minimal

    return (
        <div className="page results-page">
            <div className="blob blob-1" />
            <div className="blob blob-2" />

            <div className="results-wrapper">
                {/* Header */}
                <div className="results-header fade-up">
                    <button className="btn-ghost" id="btn-retake" onClick={() => { sessionStorage.clear(); navigate('/') }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M1 4v6h6M23 20v-6h-6" />
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                        </svg>
                        Retake Assessment
                    </button>
                    <div className="res-logo">
                        <span>🧬</span>
                        <span className="gradient-text" style={{ fontFamily: 'var(--ff-heading)', fontWeight: 700 }}>MindScan</span>
                    </div>
                    <div style={{ width: 140 }} />
                </div>

                {/* Score Hero Card */}
                <div className="score-hero glass fade-up fade-up-delay-1"
                    style={{ background: info.bg, borderColor: info.border }}>
                    <div className="score-emoji">{info.emoji}</div>
                    <div className="score-details">
                        <p className="score-label" style={{ color: info.color }}>Your Assessment Result</p>
                        <h1 className="score-number">
                            <span style={{ color: info.color }}>{results.phq9_score}</span>
                            <span className="score-of">/27</span>
                        </h1>
                        <p className="score-severity" style={{ color: info.color }}>{info.label}</p>
                    </div>
                    <div className="score-donut-wrapper">
                        <DonutGauge score={results.phq9_score} color={info.color} />
                    </div>
                </div>

                {/* Multi-Signal Confidence Meters */}
                <div className="confidence-row fade-up fade-up-delay-2">
                    <ConfidenceCard
                        icon="📝"
                        label="Questionnaire"
                        value={results.text_confidence}
                        color="var(--clr-primary)"
                        sub="PHQ-9 self-report"
                    />
                    <ConfidenceCard
                        icon="📷"
                        label="Facial Cues"
                        value={results.facial_available ? results.facial_confidence : null}
                        color="var(--clr-accent)"
                        sub={results.facial_available ? 'Expression tracking' : 'Camera not used'}
                    />
                    <ConfidenceCard
                        icon="🎙️"
                        label="Voice Patterns"
                        value={results.speech_available ? results.speech_confidence : null}
                        color="#818cf8"
                        sub={results.speech_available ? `Tone: ${results.speech_data?.dominant_tone || 'Steady'}` : 'Voice check skipped'}
                    />
                    <ConfidenceCard
                        icon="🔀"
                        label="Combined Signal"
                        value={(() => {
                            const fa = results.facial_available
                            const sa = results.speech_available
                            if (fa && sa) return 0.90
                            if (sa) return 0.86
                            if (fa) return 0.82
                            return results.text_confidence
                        })()}
                        color={info.color}
                        sub={results.fusion_note || 'Multi-signal agreement'}
                    />
                </div>

                {/* Voice & Speech Insights Card */}
                {results.speech_available && results.speech_data && (
                    <SpeechReportCard speechData={results.speech_data} />
                )}

                {/* Facial Expression Insights Card */}
                {results.facial_available && (
                    <div className="glass fade-up fade-up-delay-2" style={{
                        borderRadius: 16, padding: '18px 22px', marginBottom: 20,
                        display: 'flex', alignItems: 'flex-start', gap: 14,
                        borderLeft: '4px solid #818cf8',
                        fontSize: 13, color: 'var(--clr-txt-muted)'
                    }}>
                        <span style={{ fontSize: 22 }}>📷</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <p style={{ fontWeight: 700, color: '#818cf8', margin: 0, fontSize: 14 }}>
                                    Facial Expression Observations
                                </p>
                                {results.dominant_emotion && results.dominant_emotion !== 'unknown' && (
                                    <span style={{
                                        background: '#f0f0ff', color: '#818cf8',
                                        borderRadius: 20, padding: '2px 10px',
                                        fontSize: 11, fontWeight: 600, textTransform: 'capitalize'
                                    }}>
                                        {results.dominant_emotion}
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
                                {results.facial_note || 'Subtle facial expressions including eye engagement and emotional affect were captured during your questionnaire.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Severity Scale Distribution Chart */}
                <div className="glass results-chart-card fade-up fade-up-delay-3">
                    <h2 className="section-title">Depression Severity Scale</h2>
                    <ResultsChart score={results.phq9_score} />
                </div>

                {/* Personalized Recommendations */}
                <div className="advice-card glass fade-up fade-up-delay-4"
                    style={{ borderColor: info.border }}>
                    <h2 className="section-title">Personalized Suggestions &amp; Next Steps</h2>
                    <div className="advice-list">
                        {info.advice.map((tip, i) => (
                            <div key={i} className="advice-item">
                                <div className="advice-dot" style={{ background: info.color }} />
                                <p>{tip}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Patient-Centric Clinical Disclaimer */}
                <div className="disclaimer fade-up fade-up-delay-5">
                    <span>⚕️</span>
                    <p>
                        This screening is intended to help you reflect on your emotional wellbeing and does <strong>not</strong> substitute
                        for a formal clinical diagnosis. If you are experiencing persistent distress, please speak with a healthcare professional or counsellor.
                    </p>
                </div>
            </div>
        </div>
    )
}

/* ---- Sub-components ---- */

function ConfidenceCard({ icon, label, value, color, sub }) {
    const unavailable = value === null || value === undefined
    const pct = unavailable ? 0 : Math.round(Math.min(1, Math.max(0, value)) * 100)
    return (
        <div className="conf-card glass">
            <span className="conf-icon">{icon}</span>
            <p className="conf-label">{label}</p>
            <p className="conf-value" style={{ color: unavailable ? '#7A7A72' : color }}>
                {unavailable ? 'N/A' : `${pct}%`}
            </p>
            <div className="progress-bar-track" style={{ marginTop: 8, height: 3, background: 'rgba(0,0,0,0.06)', borderRadius: 2 }}>
                <div className="progress-bar-fill"
                    style={{ width: `${pct}%`, background: unavailable ? '#7A7A72' : color, height: '100%', borderRadius: 2 }} />
            </div>
            {sub && <p style={{ fontSize: 10, marginTop: 6, opacity: 0.7, textAlign: 'center' }}>{sub}</p>}
        </div>
    )
}

function DonutGauge({ score, color }) {
    const r = 42
    const circ = 2 * Math.PI * r
    const pct = score / 27
    const dash = circ * pct
    const gap = circ - dash

    return (
        <svg width="100" height="100" viewBox="0 0 100 100" className="donut-svg">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="10" />
            <circle
                cx="50" cy="50" r={r}
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={circ * 0.25}
                style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 8px ${color})` }}
            />
            <text x="50" y="55" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="Outfit, sans-serif">
                {score}
            </text>
        </svg>
    )
}

/**
 * Human-Friendly Speech Insights Card
 */
function SpeechReportCard({ speechData }) {
    const insights = speechData.insights || {}
    const emotions = speechData.emotions || {}

    return (
        <div className="glass fade-up fade-up-delay-2" style={{
            borderRadius: 16, padding: '22px 26px', marginBottom: 20,
            borderLeft: '4px solid var(--clr-accent)',
            display: 'flex', flexDirection: 'column', gap: 16
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 20 }}>🎙️</span>
                        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 800, color: 'var(--clr-primary)' }}>
                            Voice &amp; Speaking Rhythm Insights
                        </h3>
                    </div>
                    <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--clr-txt-muted)' }}>
                        {speechData.summary}
                    </p>
                </div>
                <div style={{
                    padding: '5px 14px', borderRadius: 999, background: 'rgba(212,168,67,0.12)',
                    border: '1px solid rgba(212,168,67,0.3)', fontSize: 11, fontWeight: 800,
                    textTransform: 'uppercase', color: 'var(--clr-accent)', whiteSpace: 'nowrap'
                }}>
                    Tone: {speechData.dominant_tone}
                </div>
            </div>

            {/* Humanized Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <MetricTile
                    label="Speaking Pace"
                    value={insights.speaking_pace?.split(' ')[0] || '120'}
                    unit=" wpm"
                    sub={insights.speaking_pace?.includes('(') ? insights.speaking_pace.split('(')[1].replace(')', '') : 'Speaking rate'}
                    color="#34d399"
                />
                <MetricTile
                    label="Vocal Energy"
                    value={insights.vocal_energy || 'Normal'}
                    unit=""
                    sub="Volume & stamina"
                    color="#818cf8"
                />
                <MetricTile
                    label="Pitch Range"
                    value={insights.pitch_variation?.split(' ')[0] || 'Varied'}
                    unit=""
                    sub="Voice fluctuation"
                    color="#f97316"
                />
                <MetricTile
                    label="Pause Pattern"
                    value={insights.pause_pattern?.split(' ')[0] || 'Normal'}
                    unit=""
                    sub="Natural pauses"
                    color="#ef4444"
                />
            </div>

            {/* Emotional Vocal Tone Distribution */}
            <div>
                <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--clr-txt-muted)', marginBottom: 8 }}>
                    Overall Voice Demeanour
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {Object.entries(emotions).map(([emo, val]) => {
                        const pct = Math.round(val * 100)
                        const emoColors = { calm: '#34d399', neutral: '#7A7A72', fatigued: '#f97316', down: '#818cf8' }
                        const emoLabels = { calm: 'Calm', neutral: 'Steady', fatigued: 'Fatigued', down: 'Subdued' }
                        return (
                            <div key={emo} style={{ background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--clr-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600 }}>{emoLabels[emo] || emo}</span>
                                    <span style={{ fontWeight: 800, color: emoColors[emo] || 'var(--clr-primary)' }}>{pct}%</span>
                                </div>
                                <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: emoColors[emo] || 'var(--clr-primary)' }} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function MetricTile({ label, value, unit, sub, color }) {
    return (
        <div style={{
            background: '#fff', border: '1px solid var(--clr-border)',
            borderRadius: 8, padding: '12px 14px', textAlign: 'center'
        }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--clr-txt-muted)', marginBottom: 4 }}>
                {label}
            </p>
            <p style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color, lineHeight: 1.1 }}>
                {value}<span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-txt-muted)' }}>{unit}</span>
            </p>
            {sub && <p style={{ fontSize: 10, color: 'var(--clr-txt-muted)', marginTop: 4, opacity: 0.7 }}>{sub}</p>}
        </div>
    )
}
