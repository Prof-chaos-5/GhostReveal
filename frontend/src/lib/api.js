import { logger } from "./logger";

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
const HF_TOKEN = import.meta.env.HF_TOKEN || "";

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

// Log initial configuration on startup
logger.info("API initialized", {
  rawBaseUrl: rawBaseUrl || "(none configured)",
  resolvedBaseUrl: API_BASE_URL || "(same origin / relative)",
  isHfSpace: API_BASE_URL.includes(".hf.space") || API_BASE_URL.includes("huggingface.co"),
  hasHfToken: Boolean(HF_TOKEN),
});

export function getHfToken() {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("ghostreveal_hf_token");
    if (stored) return stored.trim();
  }
  return (HF_TOKEN || "").trim();
}

export function setHfToken(token) {
  if (typeof window !== "undefined") {
    if (token && token.trim()) {
      localStorage.setItem("ghostreveal_hf_token", token.trim());
      logger.info("Saved Hugging Face Access Token to browser storage.");
    } else {
      localStorage.removeItem("ghostreveal_hf_token");
      logger.info("Removed Hugging Face Access Token from browser storage.");
    }
  }
}

export function getAuthHeaders() {
  const token = getHfToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Predicts using the Gradio API (Hugging Face Spaces).
 */
async function predictViaGradio(baseUrl, file) {
  const authHeaders = getAuthHeaders();
  const uploadUrl = `${baseUrl}/gradio_api/upload`;

  logger.info(`[Gradio API] 1/3 Uploading image to: ${uploadUrl}`, {
    filename: file.name,
    size: file.size,
    type: file.type,
  });

  // 1. Upload file to Gradio's upload endpoint
  const formData = new FormData();
  formData.append("files", file, file.name || "image.png");

  let uploadRes;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: authHeaders,
      body: formData,
    });
  } catch (err) {
    logger.error(`[Gradio API] Network error connecting to ${uploadUrl}:`, err);
    throw new Error(`Couldn't connect to backend server (${uploadUrl}): ${err.message}`);
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    logger.error(`[Gradio API] Upload failed with HTTP ${uploadRes.status}:`, errText);
    throw new Error(`Failed to upload image to the server (HTTP ${uploadRes.status}): ${errText}`);
  }

  const uploadData = await uploadRes.json();
  logger.info(`[Gradio API] Upload response received:`, uploadData);

  const remotePath = Array.isArray(uploadData) ? uploadData[0] : uploadData;
  if (!remotePath) {
    logger.error(`[Gradio API] Server did not return a remote path in response:`, uploadData);
    throw new Error("Server did not return a valid file path for the uploaded image.");
  }

  // 2. Initiate predict_gradio job
  const callUrl = `${baseUrl}/gradio_api/call/predict_gradio`;
  logger.info(`[Gradio API] 2/3 Initiating predict_gradio at: ${callUrl}`, { remotePath });

  let callRes;
  try {
    callRes = await fetch(callUrl, {
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
  } catch (err) {
    logger.error(`[Gradio API] Network error during predict_gradio call to ${callUrl}:`, err);
    throw new Error(`Failed to contact inference endpoint (${callUrl}): ${err.message}`);
  }

  if (!callRes.ok) {
    const errText = await callRes.text().catch(() => "");
    logger.error(`[Gradio API] predict_gradio returned HTTP ${callRes.status}:`, errText);
    throw new Error(`Inference request failed (HTTP ${callRes.status}): ${errText}`);
  }

  const callData = await callRes.json();
  const event_id = callData?.event_id;
  if (!event_id) {
    logger.error(`[Gradio API] Job ID missing in response:`, callData);
    throw new Error("Server did not assign a job ID for prediction.");
  }
  logger.info(`[Gradio API] Job scheduled with event_id: ${event_id}`);

  // 3. Listen to SSE event stream
  const streamUrl = `${baseUrl}/gradio_api/call/predict_gradio/${event_id}`;
  logger.info(`[Gradio API] 3/3 Subscribing to SSE event stream at: ${streamUrl}`);

  let streamRes;
  try {
    streamRes = await fetch(streamUrl, {
      headers: authHeaders,
    });
  } catch (err) {
    logger.error(`[Gradio API] Network error opening SSE stream at ${streamUrl}:`, err);
    throw new Error(`Failed to connect to SSE stream: ${err.message}`);
  }

  if (!streamRes.ok) {
    logger.error(`[Gradio API] SSE stream returned HTTP ${streamRes.status}`);
    throw new Error(`Failed to retrieve prediction stream (HTTP ${streamRes.status})`);
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      logger.info(`[Gradio API] SSE stream closed by server.`);
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep trailing incomplete chunk

    let currentEvent = null;
    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.replace("event:", "").trim();
      } else if (line.startsWith("data:")) {
        const rawData = line.replace("data:", "").trim();
        logger.info(`[Gradio API] Stream event '${currentEvent || "message"}':`, rawData ? rawData.slice(0, 200) : "");

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
          logger.error(`[Gradio API] Server returned error in SSE stream:`, errorMsg);
          throw new Error(errorMsg || "An error occurred during inference.");
        }
      }
    }

    if (finalResult) break;
  }

  if (!finalResult || !Array.isArray(finalResult)) {
    logger.error(`[Gradio API] Malformed or empty inference result:`, finalResult);
    throw new Error("Did not receive a complete result from the model.");
  }

  const [verdict, confidence, heatmapObj] = finalResult;
  const gradCamUrl =
    heatmapObj && typeof heatmapObj === "object" ? heatmapObj.url : heatmapObj;

  const result = {
    prediction: verdict,
    confidence: Number(confidence) || 0,
    grad_cam: gradCamUrl,
  };
  logger.info(`[Gradio API] Inference completed successfully:`, result);
  return result;
}

/**
 * Predicts using the standard FastAPI REST endpoint (POST /predict/).
 */
async function predictViaFastApi(baseUrl, file) {
  const formData = new FormData();
  formData.append("img", file);

  const endpoint = baseUrl ? `${baseUrl}/predict/` : "/predict/";
  logger.info(`[FastAPI REST] Sending POST request to: ${endpoint}`, {
    filename: file.name,
    size: file.size,
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    logger.error(`[FastAPI REST] Network error connecting to ${endpoint}:`, err);
    throw new Error(`Couldn't connect to REST endpoint (${endpoint}): ${err.message}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const textSample = await response.text().catch(() => "");
    logger.error(
      `[FastAPI REST] Expected JSON response but received content-type "${contentType}" (HTTP ${response.status}):`,
      textSample.slice(0, 300)
    );
    throw new Error(
      `The server sent back unexpected content-type (${contentType || "unknown"}, HTTP ${response.status}).`
    );
  }

  const data = await response.json();
  if (!response.ok || data.error) {
    logger.error(`[FastAPI REST] Server responded with error (HTTP ${response.status}):`, data);
    throw new Error(data.error || `Server responded with HTTP ${response.status}`);
  }

  logger.info(`[FastAPI REST] Prediction successful:`, {
    prediction: data.prediction,
    confidence: data.confidence,
    hasGradCam: Boolean(data.grad_cam),
  });
  return data;
}

/**
 * Sends an image to the GhostReveal backend for prediction.
 * Automatically chooses between Hugging Face Space (Gradio API) and standard FastAPI REST API.
 */
export async function predictImage(file) {
  logger.info(`Starting image analysis for "${file?.name}" (${(file?.size / 1024).toFixed(1)} KB)...`);

  const isHfSpace =
    API_BASE_URL.includes(".hf.space") || API_BASE_URL.includes("huggingface.co");

  if (isHfSpace) {
    logger.info(`Using Hugging Face Space mode (${API_BASE_URL}).`);
    return await predictViaGradio(API_BASE_URL, file);
  }

  // If running locally or on custom server, try standard REST endpoint first
  try {
    logger.info(`Attempting standard FastAPI REST endpoint...`);
    return await predictViaFastApi(API_BASE_URL, file);
  } catch (err) {
    logger.warn(`FastAPI REST endpoint failed: ${err.message}`);
    // If REST failed with unexpected response, try Gradio endpoint as fallback
    if (
      err.message?.includes("unexpected") ||
      err.message?.includes("404") ||
      err.message?.includes("Couldn't connect")
    ) {
      try {
        const fallbackUrl = API_BASE_URL || window.location.origin;
        logger.info(`Attempting fallback to Gradio API at: ${fallbackUrl}...`);
        return await predictViaGradio(fallbackUrl, file);
      } catch (gradioErr) {
        logger.error(`Fallback to Gradio API also failed:`, gradioErr);
        throw new Error(gradioErr.message || err.message);
      }
    }
    throw err;
  }
}
