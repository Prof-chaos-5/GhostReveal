import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import gradio as gr
import uvicorn

# Ensure repository root is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.app.routes.predict import predict_router

# 1. Initialize FastAPI app
fastapi_app = FastAPI(
    title="GhostReveal API",
    description="Backend API for GhostReveal AI Image Detection",
    version="1.0.0",
)

# 2. Add CORS middleware so Vercel can access the API
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Include predict routes
fastapi_app.include_router(predict_router)

@fastapi_app.get("/")
def root():
    return {"service": "GhostReveal API", "status": "running"}

@fastapi_app.get("/health")
def health_check():
    return {"status": "healthy"}

# 4. Gradio Interface (Runs on Hugging Face Free Tier)
with gr.Blocks(title="GhostReveal API") as demo:
    gr.Markdown("# 👻 GhostReveal API Server")
    gr.Markdown(
        """
        The backend API for **GhostReveal** is active and listening for requests!
        
        ### Endpoints:
        - `POST /predict/` — Accepts an image file (`img`) and returns prediction, confidence, and Grad-CAM heatmap.
        - `GET /health` — Service health check.
        - `GET /` — Service status check.
        """
    )

# 5. Mount Gradio to FastAPI
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
