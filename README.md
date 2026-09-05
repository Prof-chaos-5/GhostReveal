# GhostReveal

**See through the pixels.** GhostReveal is an AI-generated image detection system. Upload a photo and it tells you whether the image is real or AI-generated, with a confidence score and a Grad-CAM heatmap showing *which* regions of the image drove the model's decision.

🔗 **Live demo:** [https://ghost-reveal-v1.vercel.app/](#) · **Model API:** [https://profchaos-ghostreveal-api.hf.space]


[Upload screen](docs/screen.png)
[Verdict + confidence](docs/ver.png)
[Grad-CAM overlay](docs/Grad.png)

## How it works

1. You drag/drop or select an image in the web app.
2. The image is sent to a FastAPI backend, which feeds it through a fine-tuned **EfficientNetV2-B3** binary classifier (Keras 3 / TensorFlow).
3. The backend runs **Grad-CAM** on the model's last convolutional layer to generate a heatmap overlay, then returns the verdict, a confidence score, and the heatmap image.
4. The frontend shows a "REAL IMAGE" / "AI GENERATED" verdict with the confidence percentage, and lets you toggle the Grad-CAM overlay on top of your upload.

## Tech stack

| Layer    | Stack |
|----------|-------|
| Frontend | React 19, Vite, React Router, Tailwind CSS v4 |
| Backend  | FastAPI, Uvicorn, Pillow |
| Model    | TensorFlow / Keras 3, EfficientNetV2-B3 backbone, Grad-CAM explainability |
| Model hosting | Gradio app on Hugging Face Spaces |

## Project structure

```
GhostReveal/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app entrypoint, CORS, /health route
│       ├── routes/predict.py    # POST /predict/ — runs inference, returns JSON
│       └── utils/predict_utils.py
├── frontend/
│   ├── src/
│   │   ├── pages/Home.jsx       # Upload screen
│   │   ├── pages/Result.jsx     # Verdict + confidence + Grad-CAM toggle
│   │   ├── components/ScanUploader.jsx
│   │   └── lib/api.js           # Talks to the backend
│   └── package.json
├── models/
│   ├── final_interface.py       # Model loading, preprocessing, Grad-CAM, predict()
│   └── final_model_defactify/   # Trained weights (config.json + model.weights.h5)
├── tests/                       # Sample images for manually exercising the pipeline
├── LICENSE
└── requirements.txt             # Backend + model environment
```

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

python -m backend.app.main
# or: uvicorn backend.app.main:app --reload
```

The API starts on `http://localhost:8000`. Run every command from the **repo root** — `requirements.txt` lives there, and `backend/app/main.py` imports via the `backend.app.*` package path, so it won't resolve if you `cd backend` first.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app starts on `http://localhost:5173` and expects the backend at `http://localhost:8000` (override with a `VITE_API_BASE_URL` env variable).

## API reference

### `GET /health`
Health check. Returns `{"status": "healthy"}`.

### `POST /predict/`
Analyzes an uploaded image.

- **Body:** `multipart/form-data` with a single field `img` (JPEG or PNG)
- **Success response:**
  ```json
  {
    "prediction": "AI Generated Image",
    "confidence": 0.9421,
    "grad_cam": "<base64-encoded PNG>"
  }
  ```
- **Error response:** `{"error": "..."}` (invalid or unreadable image)

## Model

The classifier lives in `models/final_model_defactify/` and is loaded via `models/final_interface.py`:

- **Backbone:** EfficientNetV2-B3, input size 300×300, single sigmoid output (real vs. AI-generated)
- **Training data:** [Defactify Image Dataset](https://huggingface.co/datasets/Rajarshi-Roy-research/Defactify_Image_Dataset) — MS COCO real images paired with AI-generated counterparts from five modern generators (Stable Diffusion 2.1, SDXL, SD3, DALL-E 3, Midjourney v6)
- **Explainability:** Grad-CAM is computed against the last 4D convolutional layer of the backbone, then blended over the original image as a red/green/blue heatmap overlay
- Weights and architecture are stored separately (`model.weights.h5` + `config.json`) rather than as a single bundled model file

### Current results

| Metric | Value |
|---|---|
| Accuracy |98.86% |
| F1 (binary) | 97.53% |
| AUC | 98.97% |

*(Trained/evaluated on a random split of the Defactify dataset — see [Future Scope](#future-scope--research-directions) for the more rigorous held-out-generator evaluation planned next.)*

## Roadmap / known gaps

- `requirements.txt` reflects the actual backend + model runtime; frontend dependencies are tracked separately in `frontend/package.json`
- No automated test suite yet; `tests/` currently holds sample images for manual checks against the `/predict/` endpoint
- Evaluation so far uses a random train/val split — it does **not** yet test generalization to a generator excluded from training (see below)

## Future Scope / Research Directions

The current model is a solid working baseline, but a few open questions came up during development that are worth pursuing further:

### 1. Held-out-generator generalization
The Defactify dataset labels every image with its specific source generator (`Label_B`: real, SD2.1, SDXL, SD3, DALL-E3, Midjourney). The current model was trained on a random mix of all five. A more rigorous test — and a much stronger claim than "we got X% accuracy" — is to **hold one or more generators out of training entirely** (e.g., train on Real + SD2.1 + SDXL + SD3, test only on DALL-E3 + Midjourney) and measure how much accuracy drops on the unseen generator(s). Early informal testing on a separate legacy-data model showed clear failures on modern AI images it hadn't been trained to recognize — this would quantify that gap properly instead of relying on anecdote.

### 2. Frequency-domain fusion (FIRE-style architecture)
A parallel line of work (GhostReveal's earlier prototype, trained on a legacy Kaggle dataset) explored fusing RGB features with a frequency-domain (FFT-based) branch, on the hypothesis that different generators leave distinct spectral fingerprints. Results on in-distribution data showed only a small, seed-fragile improvement over RGB alone — but that experiment never had generator labels to test the more interesting question: **does frequency information help specifically when the test generator is unseen at training time?** That's the more promising place to point this architecture next, using Defactify's `Label_B` to build the held-out split from (1).

### 3. Generator attribution (multi-class)
Beyond real-vs-AI, Defactify supports a second task: identifying *which* of the five generators produced a given image (5-class classification). This is arguably a more natural fit for frequency-domain features than binary detection, since the underlying hypothesis is that each generator architecture leaves a distinguishable signature. An **open-set** version of this — train on 3-4 generators, then see whether the model can recognize "this doesn't match any generator I know" rather than confidently misattributing a new one — is a genuinely open problem in AI-forensics research and would be the strongest novelty claim among these directions.

### 4. Statistically rigorous evaluation
Any of the above should be evaluated with matched multi-seed runs (same seeds across model variants) and paired significance testing, rather than a single train/val split — single-split results in this space have already been observed to vary considerably run to run.

## Contributing

Issues and PRs are welcome — this is an early-stage project, so expect things to move fast.

## License

Released under the [MIT License](LICENSE).