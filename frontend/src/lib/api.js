const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN || "";

function normalizeBaseUrl(url) {
  if (!url) return "";
  let cleaned = url.trim().replace(/\/+$/, "");
  // Handle case where someone pastes the HF Space web URL instead of the direct app URL
  const hfMatch = cleaned.match(/huggingface\.co\/spaces\/([^/]+)\/([^/]+)/);
  if (hfMatch) {
    const user = hfMatch[1].toLowerCase();
    const space = hfMatch[2].toLowerCase();
    return `https://${user}-${space}.hf.space`;
  }
  return cleaned;
}

const API_BASE_URL = normalizeBaseUrl(rawBaseUrl);

function getAuthHeaders() {
  return HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};
}

/**
 * Predicts using the Gradio API (Hugging Face Spaces).
 */
async function predictViaGradio(baseUrl, file) {
  const authHeaders = getAuthHeaders();

  // 1. Upload file to Gradio's upload endpoint
  const formData = new FormData();
  formData.append("files", file, file.name || "image.png");

  let uploadRes;
  try {
    uploadRes = await fetch(`${baseUrl}/gradio_api/upload`, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
  } catch {
    throw new Error("Couldn't connect to the backend server. Please verify your connection.");
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Failed to upload image to the server: ${uploadRes.status} ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const remotePath = Array.isArray(uploadData) ? uploadData[0] : uploadData;
  if (!remotePath) {
    throw new Error("Server did not return a valid file path for the uploaded image.");
  }

  // 2. Initiate predict_gradio job
  const callRes = await fetch(`${baseUrl}/gradio_api/call/predict_gradio`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({
      data: [
        {
          path: remotePath,
          meta: { _type: "gradio.FileData" },
        },
      ],
    }),
  });

  if (!callRes.ok) {
    const errText = await callRes.text().catch(() => "");
    throw new Error(`Inference request failed: ${callRes.status} ${errText}`);
  }

  const { event_id } = await callRes.json();
  if (!event_id) {
    throw new Error("Server did not assign a job ID for prediction.");
  }

  // 3. Listen to SSE event stream
  const streamRes = await fetch(`${baseUrl}/gradio_api/call/predict_gradio/${event_id}`, {
    headers: authHeaders,
  });
  if (!streamRes.ok) {
    throw new Error(`Failed to retrieve prediction stream: ${streamRes.status}`);
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep trailing incomplete chunk

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.replace("event:", "").trim();
      } else if (line.startsWith("data:")) {
        const rawData = line.replace("data:", "").trim();
        if (currentEvent === "complete") {
          try {
            finalResult = JSON.parse(rawData);
          } catch {
            finalResult = rawData;
          }
          break;
        } else if (currentEvent === "error") {
          let errorMsg = rawData;
          try {
            const parsed = JSON.parse(rawData);
            errorMsg = parsed.error || parsed.message || rawData;
          } catch {
            // keep raw string
          }
          throw new Error(errorMsg || "An error occurred during inference.");
        }
      }
    }

    if (finalResult) break;
  }

  if (!finalResult || !Array.isArray(finalResult)) {
    throw new Error("Did not receive a complete result from the model.");
  }

  const [verdict, confidence, heatmapObj] = finalResult;
  const gradCamUrl =
    heatmapObj && typeof heatmapObj === "object" ? heatmapObj.url : heatmapObj;

  return {
    prediction: verdict,
    confidence: Number(confidence) || 0,
    grad_cam: gradCamUrl,
  };
}

/**
 * Predicts using the standard FastAPI REST endpoint (POST /predict/).
 */
async function predictViaFastApi(baseUrl, file) {
  const formData = new FormData();
  formData.append("img", file);

  const endpoint = baseUrl ? `${baseUrl}/predict/` : "/predict/";
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("The server sent back something unexpected.");
  }

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || "Something went wrong analyzing the image.");
  }

  return data;
}

/**
 * Sends an image to the GhostReveal backend for prediction.
 * Automatically chooses between Hugging Face Space (Gradio API) and standard FastAPI REST API.
 */
export async function predictImage(file) {
  const isHfSpace =
    API_BASE_URL.includes(".hf.space") || API_BASE_URL.includes("huggingface.co");

  if (isHfSpace) {
    return await predictViaGradio(API_BASE_URL, file);
  }

  // If running locally or on custom server, try standard REST endpoint first
  try {
    return await predictViaFastApi(API_BASE_URL, file);
  } catch (err) {
    // If REST failed with unexpected response, try Gradio endpoint as fallback
    if (err.message?.includes("unexpected") || err.message?.includes("404")) {
      try {
        return await predictViaGradio(API_BASE_URL || window.location.origin, file);
      } catch (gradioErr) {
        throw new Error(gradioErr.message || err.message);
      }
    }
    throw err;
  }
}
