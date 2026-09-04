import os
import sys
from fastapi.middleware.cors import CORSMiddleware
import gradio as gr

# Support Hugging Face ZeroGPU environment
try:
    import spaces
except ImportError:
    class MockSpaces:
        @staticmethod
        def GPU(fn=None, duration=None):
            if fn is not None:
                return fn
            def decorator(f):
                return f
            return decorator
    spaces = MockSpaces()

# Ensure repository root is on sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.app.routes.predict import predict_router

@spaces.GPU
def predict_gradio(image):
    if image is None:
        return "Please upload an image.", 0.0, None
    try:
        from PIL import Image
        from backend.app.routes.predict import get_model
        from models.final_interface import predict
        
        pil_img = Image.fromarray(image).convert("RGB")
        active_model = get_model()
        prediction, confidence, grad_cam = predict(pil_img, active_model)
        return prediction, float(confidence), grad_cam
    except Exception as e:
        return f"Error: {str(e)}", 0.0, None

# 1. Define Gradio Interface (Interactive UI + API endpoints)
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

    with gr.Row():
        with gr.Column():
            img_input = gr.Image(label="Test Image Upload", type="numpy")
            btn = gr.Button("Analyze Image", variant="primary")
        with gr.Column():
            verdict_output = gr.Textbox(label="Verdict")
            conf_output = gr.Number(label="Confidence")
            heatmap_output = gr.Image(label="Grad-CAM Heatmap")

    btn.click(
        fn=predict_gradio,
        inputs=img_input,
        outputs=[verdict_output, conf_output, heatmap_output]
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
