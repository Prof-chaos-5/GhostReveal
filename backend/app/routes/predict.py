from fastapi import APIRouter,File,UploadFile
from PIL import Image , UnidentifiedImageError
import base64
from io import BytesIO

from backend.app.utils.predict_utils import validateImageType
from models.final_interface import load_model, preprocess_image, predict
_model = None

def get_model():
    global _model
    if _model is None:
        _model = load_model()
    return _model

predict_router = APIRouter(prefix="/predict")

@predict_router.get("/")
def get():
    return {"method": "get", "health": "ok"}

@predict_router.post("/")
def post(img: UploadFile = File(...)):
    # read image 
    try:
        image = Image.open(img.file)
    except UnidentifiedImageError:
        return {"error": "Unable to identify the image format."}

    # validate image format
    if not validateImageType(image):
        return {"error": "Invalid image format. Only JPEG and PNG are supported."}

    try:
        active_model = get_model()
    except FileNotFoundError as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Failed to load model: {str(e)}"}

    prediction, confidence, grad_cam = predict(image, active_model)

    # return json with results from model
    buffer = BytesIO()
    grad_cam.save(buffer, format="PNG")
    grad_cam_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return {"prediction": prediction, "confidence": confidence, "grad_cam": grad_cam_b64}
    