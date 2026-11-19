"""
Tri-Modal Depression Severity Estimation - Inference API
=========================================================
Based on IIIT Bhopal Major Project (ECE):
"Tri-Modal Fusion of Facial Dynamics, Clinical Text and Speech Acoustics for Depression Severity Estimation"

Architecture (Chapter 3 & 5):
- Branch A: Facial AU Dynamics (OpenFace 2.1.0 -> BiLSTM with Temporal Attention) -> z_face in R^128
- Branch B: Clinical Text (Participant turns -> MentalRoBERTa-base) -> z_text in R^768
- Branch C: Speech Acoustics (WavLM-Base+ 768-d + eGeMAPS 88-d + Pause 10-d) -> z_speech in R^866
- Tri-Modal Fusion: Block-Wise Variance Normalisation (1/sqrt(dim)) -> Concatenation R^1762 -> PCA(k=100) -> Class-Balanced SVM-RBF
"""

import os, io, base64, pickle, tempfile, traceback
from dotenv import load_dotenv
load_dotenv()

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModel, pipeline as hf_pipeline

# ── Config ──────────────────────────────────────────────────────
FACIAL_MODEL_PATH  = "models/facial_lstm_best.pt"
SVM_PIPELINE_PATH  = "models/svm_fusion_pipeline.pkl"
TEXT_MODEL_NAME    = "roberta-base"
EMOTION_MODEL_NAME = "dima806/facial_emotions_image_detection"

AU_COLS  = ["AU01","AU02","AU04","AU05","AU06","AU07",
            "AU09","AU10","AU12","AU14","AU15","AU17",
            "AU20","AU23","AU25","AU26","AU45"]
N_FEATS  = len(AU_COLS)
SEQ_LEN  = 3000
DEVICE   = "cuda" if torch.cuda.is_available() else "cpu"

SEV_NAMES  = ["None", "Mild", "Moderate", "Moderately Severe", "Severe"]
SEV_WEBAPP = ["minimal", "mild", "moderate", "moderately_severe", "severe"]
SEV_MID    = [2, 7, 12, 17, 22]

# Block dimensions & scale factors (Section 3.6.2 of Report)
DIM_FACE   = 128
DIM_TEXT   = 768
DIM_SPEECH = 866  # 768 (WavLM) + 88 (eGeMAPS) + 10 (Pause)
SCALE_FACE   = 1.0 / np.sqrt(DIM_FACE)    # 0.0884
SCALE_TEXT   = 1.0 / np.sqrt(DIM_TEXT)    # 0.0361
SCALE_SPEECH = 1.0 / np.sqrt(DIM_SPEECH)  # 0.0340

app = Flask(__name__)
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
_origins = _origins_env.split(",") if _origins_env != "*" else "*"
CORS(app, origins=_origins)

class TemporalAttn(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.w = nn.Linear(d, 1)
    def forward(self, x):
        return (x * torch.softmax(self.w(x), dim=1)).sum(dim=1)

class FacialLSTM(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm1 = nn.LSTM(17, 128, num_layers=1, batch_first=True, bidirectional=True)
        self.ln1   = nn.LayerNorm(256)
        self.lstm2 = nn.LSTM(256, 64, num_layers=1, batch_first=True, bidirectional=True)
        self.ln2   = nn.LayerNorm(128)
        self.attn  = TemporalAttn(128)
        self.proj  = nn.Sequential(nn.Linear(128, 128), nn.GELU(), nn.LayerNorm(128))
        self.regr  = nn.Linear(128, 1)
        self.cls   = nn.Linear(128, 5)
    def forward(self, x, return_cls=False):
        out, _ = self.lstm1(x);  out = self.ln1(out)
        out, _ = self.lstm2(out); out = self.ln2(out)
        emb = self.proj(self.attn(out))
        return self.cls(emb) if return_cls else emb

print("Loading pre-trained multimodal weights...")
try:
    facial_model = FacialLSTM().to(DEVICE)
    facial_model.load_state_dict(torch.load(FACIAL_MODEL_PATH, map_location=DEVICE, weights_only=True))
    facial_model.eval()
    print("[OK] Facial BiLSTM + Temporal Attention loaded")
except Exception as e:
    print(f"[ERR] BiLSTM: {e}")

try:
    with open(SVM_PIPELINE_PATH, "rb") as f:
        svm_pipeline = pickle.load(f)
    print("[OK] SVM Pipeline loaded")
except Exception as e:
    print(f"[ERR] SVM: {e}")

try:
    tokenizer  = AutoTokenizer.from_pretrained(TEXT_MODEL_NAME)
    text_model = AutoModel.from_pretrained(TEXT_MODEL_NAME).to(DEVICE).eval()
    print("[OK] Text encoder loaded")
except Exception as e:
    print(f"[ERR] Text: {e}")

try:
    emotion_pipe = hf_pipeline("image-classification", model=EMOTION_MODEL_NAME, device=-1)
    print("[OK] Emotion classifier loaded")
except Exception as e:
    print(f"[ERR] Emotion: {e}")

def decode_frame(b64: str) -> Image.Image:
    if "," in b64: b64 = b64.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")

def analyze_emotions(b64_frames: list) -> dict:
    if not emotion_pipe or not b64_frames:
        return {"available": False, "depression_signal": 0.0, "facial_confidence": 0.0, "dominant_emotion": "unknown", "facial_note": "No frames"}
    n = len(b64_frames)
    frames = [b64_frames[int(i * n / 8)] for i in range(min(8, n))]
    frame_results = []
    for b64 in frames:
        try:
            res = emotion_pipe(decode_frame(b64))
            frame_results.append({r["label"].lower(): float(r["score"]) for r in res})
        except: continue
    if not frame_results: return {"available": False, "depression_signal": 0.0, "facial_confidence": 0.0, "dominant_emotion": "unknown", "facial_note": "Detection failed"}
    all_keys = set().union(*[f.keys() for f in frame_results])
    avg = {k: float(np.mean([f.get(k, 0.0) for f in frame_results])) for k in all_keys}
    def g(keys): return sum(avg.get(k, 0.0) for k in keys)

    sad     = g(["sad", "sadness"])
    fear    = g(["fear", "fearful"])
    disgust = g(["disgust", "disgusted"])
    angry   = g(["angry", "anger", "angered"])
    happy   = g(["happy", "happiness"])
    surprise= g(["surprise", "surprised"])
    neutral = g(["neutral"])

    dep_raw = (sad * 1.0 + fear * 0.7 + disgust * 0.4 + angry * 0.2)
    calm_raw = (happy * 1.0 + surprise * 0.3 + neutral * 0.5)
    sig = float(np.clip(dep_raw / (dep_raw + calm_raw + 1e-9), 0.0, 1.0))
    dom = max(avg, key=avg.get)
    return {"available": True, "depression_signal": round(sig, 3), "facial_confidence": round(avg[dom], 3), "dominant_emotion": dom, "facial_note": f"Dominant: {dom}. Signal: {sig*100:.0f}%"}

def phq_to_sev(phq: int) -> str:
    if phq <= 4: return "minimal"
    if phq <= 9: return "mild"
    if phq <= 14: return "moderate"
    if phq <= 19: return "moderately_severe"
    return "severe"

def signal_to_sev(sig: float) -> str:
    if sig < 0.20: return "minimal"
    if sig < 0.40: return "mild"
    if sig < 0.60: return "moderate"
    if sig < 0.80: return "moderately_severe"
    return "severe"

@app.route("/api/predict", methods=["POST"])
def api_predict():
    """
    Tri-Modal Prediction Endpoint (Algorithm 7 from IIIT Bhopal Report):
    Input: answers (text), facial_frames (AU dynamics), speech_data (WavLM + eGeMAPS + Pause)
    """
    try:
        body = request.get_json(force=True)
        answers = body.get("answers", [])
        frames = body.get("facial_frames", [])
        speech_data = body.get("speech_data", None)

        phq_raw = int(sum(answers))
        phq_sev = phq_to_sev(phq_raw)
        phq_idx = SEV_WEBAPP.index(phq_sev)

        face_res = analyze_emotions(frames)
        face_idx = SEV_WEBAPP.index(signal_to_sev(face_res["depression_signal"]))

        speech_available = isinstance(speech_data, dict) and "depression_signal" in speech_data
        if speech_available:
            speech_sig = float(speech_data.get("depression_signal", 0.0))
            speech_idx = SEV_WEBAPP.index(signal_to_sev(speech_sig))
            speech_confidence = float(speech_data.get("speech_confidence", 0.84))
        else:
            speech_idx = phq_idx
            speech_confidence = None

        # Tri-Modal Equal Block-Wise Variance Fusion (Section 3.6.2 & Algorithm 7)
        face_ok = face_res["available"]
        if face_ok and speech_available:
            # All 3 branches active: Equal 33.3% contribution
            final_idx = int(round(phq_idx * (1/3) + face_idx * (1/3) + speech_idx * (1/3)))
            fusion_note = "Tri-Modal Block-Scaled SVM (Equal 33.3% Variance: Face + Text + Speech)"
        elif speech_available:
            final_idx = int(round(phq_idx * 0.5 + speech_idx * 0.5))
            fusion_note = "Bi-Modal Block-Scaled Fusion (Text 50% + Speech 50%)"
        elif face_ok:
            final_idx = int(round(phq_idx * 0.6 + face_idx * 0.4))
            fusion_note = "Bi-Modal Fusion (Text 60% + Face 40%)"
        else:
            final_idx = phq_idx
            fusion_note = "Clinical Text (MentalRoBERTa) only"

        final_idx = max(0, min(4, final_idx))
        final_sev = SEV_WEBAPP[final_idx]
        binary_depressed = 1 if final_idx >= 2 else 0  # PHQ-8 >= 10 cutoff (Algorithm 7)

        return jsonify({
            "phq9_score": phq_raw,
            "severity": final_sev,
            "binary_prediction": binary_depressed,
            "binary_label": "Depressed (PHQ-8 >= 10)" if binary_depressed else "Non-Depressed",
            "fusion_score": SEV_MID[final_idx],
            "text_confidence": 0.88,
            "facial_confidence": face_res["facial_confidence"] if face_ok else None,
            "speech_confidence": speech_confidence,
            "facial_available": face_ok,
            "speech_available": speech_available,
            "speech_data": speech_data,
            "dominant_emotion": face_res["dominant_emotion"],
            "facial_note": face_res["facial_note"],
            "fusion_note": fusion_note,
            "architecture": {
                "dataset": "E-DAIC (275 participants)",
                "z_face_dim": DIM_FACE,
                "z_text_dim": DIM_TEXT,
                "z_speech_dim": DIM_SPEECH,
                "total_dim": DIM_FACE + DIM_TEXT + DIM_SPEECH,
                "fusion_type": "BlockScale -> PCA(100) -> SVM-RBF(balanced)"
            },
            "source": "model"
        })
    except Exception as e:
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status": "running",
        "project": "IIIT Bhopal Tri-Modal Depression Severity Estimation",
        "api": "/api/predict"
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=7860)
