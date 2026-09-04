import os
import sys
import base64
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
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

from backend.app.utils.predict_utils import validateImageType
from backend.app.routes.predict import get_model
from models.final_interface import predict

@spaces.GPU
def predict_gradio(image):
    if image is None:
        return "Please upload an image.", 0.0, None
    try:
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

# 3. Mount Starlette-compatible REST routes for the frontend
@demo.app.get("/health")
def health_check():
    return {"status": "healthy"}

@demo.app.get("/api-status")
def api_status():
    return {"service": "GhostReveal API", "status": "running"}

@demo.app.post("/predict/")
async def predict_api(request: Request):
    form = await request.form()
    img_file = form.get("img")
    if not img_file:
        return JSONResponse({"error": "No image uploaded. Expected field 'img'."}, status_code=400)
    
    try:
        image = Image.open(img_file.file)
    except UnidentifiedImageError:
        return JSONResponse({"error": "Unable to identify the image format."}, status_code=400)
    
    if not validateImageType(image):
        return JSONResponse({"error": "Invalid image format. Only JPEG and PNG are supported."}, status_code=400)
        
    try:
        active_model = get_model()
    except Exception as e:
        return JSONResponse({"error": f"Failed to load model: {str(e)}"}, status_code=500)
        
    prediction, confidence, grad_cam = predict(image, active_model)
    
    buffer = BytesIO()
    grad_cam.save(buffer, format="PNG")
    grad_cam_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
    
    return JSONResponse({
        "prediction": prediction,
        "confidence": float(confidence),
        "grad_cam": grad_cam_b64
    })

# 4. Standard Gradio Launch: Hugging Face automatically handles port 7860
if __name__ == "__main__":
    demo.launch(ssr_mode=False)
