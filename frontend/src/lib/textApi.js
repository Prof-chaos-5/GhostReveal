import { logger } from "./logger";

// CONFIG: the text model is served as static files by the Hugging Face Space (no Python backend, no token needed).
// Files expected at: https://huggingface.co/spaces/<TEXT_SPACE>/resolve/main/models/<TEXT_MODEL_DIR>/
//   config.json, tokenizer.json, tokenizer_config.json, onnx/model.onnx
const TEXT_SPACE = import.meta.env.VITE_TEXT_SPACE || "M0HIT67/GhostRevaeal1.1"; // CONFIG
const TEXT_MODEL_DIR = import.meta.env.VITE_TEXT_MODEL_DIR || "text_onnx"; // CONFIG
const TEXT_DTYPE = import.meta.env.VITE_TEXT_MODEL_DTYPE || "fp32"; // CONFIG: "q8" needs onnx/model_quantized.onnx
const MAX_LENGTH = Number(import.meta.env.VITE_TEXT_MAX_LENGTH) || 256; // CONFIG
export const MAX_TEXT_CHARS = 20000;

// The transformers library is imported lazily so the image pages don't pay for its download.
let libPromise = null;
function getLib() {
  if (!libPromise) {
    libPromise = import("@huggingface/transformers").then((lib) => {
      // Load from the Space's files instead of the Hub model catalogue; never look on the app's own origin.
      lib.env.allowLocalModels = false;
      lib.env.allowRemoteModels = true;
      lib.env.useBrowserCache = true; // after the first visit the ~440 MB model comes from the browser cache
      lib.env.remoteHost = `https://huggingface.co/spaces/${TEXT_SPACE}/`;
      lib.env.remotePathTemplate = "resolve/{revision}/models/{model}/";
      return lib;
    });
  }
  return libPromise;
}

logger.info("Text API initialized", {
  space: TEXT_SPACE,
  modelDir: TEXT_MODEL_DIR,
  dtype: TEXT_DTYPE,
  maxLength: MAX_LENGTH,
});

let loadPromise = null;

function makeProgressHandler(onProgress) {
  const files = {};
  return (e) => {
    if (e.status !== "progress" || !e.total) return;
    files[e.file] = { loaded: e.loaded, total: e.total };
    const all = Object.values(files);
    const loaded = all.reduce((s, f) => s + f.loaded, 0);
    const total = all.reduce((s, f) => s + f.total, 0);
    onProgress?.({ loaded, total, percent: (loaded / total) * 100 });
  };
}

export function isTextModelLoaded() {
  return loadPromise !== null;
}

function loadTextModel(onProgress) {
  if (!loadPromise) {
    logger.info(`[Text Model] Loading ${TEXT_MODEL_DIR} from Space ${TEXT_SPACE}`);
    const progress_callback = makeProgressHandler(onProgress);
    loadPromise = getLib()
      .then(({ AutoTokenizer, AutoModelForSequenceClassification }) =>
        Promise.all([
          AutoTokenizer.from_pretrained(TEXT_MODEL_DIR, { progress_callback }),
          AutoModelForSequenceClassification.from_pretrained(TEXT_MODEL_DIR, {
            dtype: TEXT_DTYPE,
            progress_callback,
          }),
        ])
      )
      .then((pair) => {
        logger.info("[Text Model] Model and tokenizer ready.");
        return pair;
      })
      .catch((err) => {
        loadPromise = null; // allow a retry
        logger.error("[Text Model] Failed to load model files:", err);
        throw new Error(`Couldn't load the text model from the Hugging Face Space: ${err.message}`);
      });
  }
  return loadPromise;
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

/**
 * Classifies text as AI-generated or human-written, entirely in the browser.
 * Returns { label, class_id, confidence, probabilities: { human, ai } }.
 */
export async function predictText(text, onProgress) {
  if (!text || !text.trim()) throw new Error("Please enter some text.");
  if (text.length > MAX_TEXT_CHARS) {
    throw new Error(`Text is too long. Maximum is ${MAX_TEXT_CHARS} characters.`);
  }
  logger.info(`Starting text analysis (${text.length} characters)...`);

  const [tokenizer, model] = await loadTextModel(onProgress);

  const inputs = tokenizer(text, { truncation: true, padding: "max_length", max_length: MAX_LENGTH });
  const { logits } = await model(inputs);
  const probs = softmax(Array.from(logits.data));
  const classId = probs[1] > probs[0] ? 1 : 0;

  const result = {
    label: classId === 1 ? "AI-generated" : "Human-written",
    class_id: classId,
    confidence: probs[classId],
    probabilities: { human: probs[0], ai: probs[1] },
  };
  logger.info("[Text Model] Prediction successful:", result);
  return result;
}
