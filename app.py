import os
import sys
import gradio as gr
from fastapi.middleware.cors import CORSMiddleware

# Ensure repository root is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.app.routes.predict import predict_router

# 1. Define Gradio Interface (Runs natively on Hugging Face Free Tier)
with gr.Blocks(title="GhostReveal API") as demo:
    gr.Markdown("# 👻 GhostReveal API Server")
    gr.Markdown(
        """
        The backend API for **GhostReveal** is active and listening for requests!
        
        ### Endpoints:
        - `POST /predict/` — Accepts an image file (`img`) and returns prediction, confidence, and Grad-CAM heatmap.
        - `GET /health` — Service health check.
        """
    )

# 2. Attach CORS middleware directly to the Gradio FastAPI application
demo.app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Mount existing FastAPI predict router and health routes
demo.app.include_router(predict_router)

@demo.app.get("/health")
def health_check():
    return {"status": "healthy"}

@demo.app.get("/api-status")
def api_status():
    return {"service": "GhostReveal API", "status": "running"}

# 4. Standard Gradio Launch: Hugging Face automatically handles port 7860
if __name__ == "__main__":
    demo.launch(ssr_mode=False)
