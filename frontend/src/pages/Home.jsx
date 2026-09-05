import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import ScanUploader from "../components/ScanUploader";
import { predictImage, getHfToken, setHfToken } from "../lib/api";
import { logger } from "../lib/logger";

export default function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pickError, setPickError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [scanning, setScanning] = useState(false);

  // HF Token management
  const [activeToken, setActiveToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showTokenModal, setShowTokenModal] = useState(false);

  useEffect(() => {
    const current = getHfToken();
    setActiveToken(current);
    setTokenInput(current);
  }, []);

  const isZeroGpuError = /zerogpu|runs limit|authenticate with a hugging face token/i.test(
    submitError || ""
  );

  const handleFileSelected = (picked, error) => {
    setSubmitError(null);
    if (error) {
      logger.warn(`File selection rejected: ${error}`);
      setPickError(error);
      return;
    }
    setPickError(null);
    setFile(picked);
    if (picked) {
      logger.info(
        `File selected: "${picked.name}" (${(picked.size / 1024).toFixed(1)} KB, type: ${picked.type || "unknown"})`
      );
      setPreviewUrl(URL.createObjectURL(picked));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleAnalyzeWithFile = async (imageFile) => {
    const targetFile = imageFile || file;
    if (!targetFile || scanning) return;
    setScanning(true);
    setSubmitError(null);
    logger.info(`Starting analysis for image "${targetFile.name}"...`);

    try {
      const result = await predictImage(targetFile);
      logger.info(`Analysis succeeded! Navigating to /result.`, result);
      navigate("/result", {
        state: {
          prediction: result.prediction,
          confidence: result.confidence,
          gradCam: result.grad_cam,
          previewUrl,
        },
      });
    } catch (err) {
      logger.error(`Analysis failed for "${targetFile.name}": ${err.message}`, err);
      setSubmitError(err.message);
      setScanning(false);
    }
  };

  const handleSaveTokenAndRetry = () => {
    const trimmed = tokenInput.trim();
    setHfToken(trimmed);
    setActiveToken(trimmed);
    setShowTokenModal(false);
    logger.info(`Updated Hugging Face token: ${trimmed ? "Token saved" : "Token cleared"}`);
    if (file) {
      handleAnalyzeWithFile(file);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6">
      <header className="flex items-center justify-between py-8">
        <Logo />
        <button
          type="button"
          onClick={() => setShowTokenModal(true)}
          title="Configure Hugging Face Access Token"
          className="flex items-center gap-1.5 rounded-full border border-paper-line bg-white/70 px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:bg-white hover:text-ink"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              activeToken ? "bg-signal-real" : "bg-ink-soft/40"
            }`}
          />
          <span>{activeToken ? "HF Token Active" : "Add HF Token"}</span>
        </button>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-8 pb-16">
        <div className="text-center">
          <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]">
            See through the pixels.
          </h1>
          <p className="mx-auto mt-3 max-w-[38ch] text-[15px] text-ink-soft">
            Upload an image and GhostReveal will tell you whether it's real
            or AI-generated, with a confidence score.
          </p>
        </div>

        <ScanUploader
          onFileSelected={handleFileSelected}
          file={file}
          previewUrl={previewUrl}
          scanning={scanning}
          error={pickError}
        />

        {/* ZeroGPU Quota Exceeded Helper Card */}
        {submitError && isZeroGpuError && (
          <div className="-mt-4 flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-50/90 p-4 text-left shadow-xs">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 text-amber-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-display text-[14px] font-semibold text-amber-900">
                  ZeroGPU Quota Limit Reached
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
                  Hugging Face limits anonymous requests to ZeroGPU spaces. Add a free Hugging Face User Access Token (Read) to authenticate and use your account's quota.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                placeholder="Paste Hugging Face token (hf_...)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="flex-1 rounded-xl border border-amber-300 bg-white px-3.5 py-2 font-mono text-[12px] text-ink placeholder:text-ink-soft/50 focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveTokenAndRetry}
                disabled={!tokenInput.trim() || scanning}
                className="rounded-xl bg-ink px-4 py-2 text-[12px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Save & Retry
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-amber-200/60 pt-2 text-[11px] text-amber-800">
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline hover:text-amber-950"
              >
                Get free token at huggingface.co ↗
              </a>
              <button
                type="button"
                onClick={() => logger.openViewer()}
                className="underline hover:text-amber-950"
              >
                View logs
              </button>
            </div>
          </div>
        )}

        {/* Generic Error Banner */}
        {submitError && !isZeroGpuError && (
          <div className="-mt-4 flex flex-col items-center gap-1.5 rounded-xl border border-signal-ai/30 bg-signal-ai-soft p-3 text-center">
            <p className="text-[13px] font-medium text-signal-ai">{submitError}</p>
            <button
              type="button"
              onClick={() => logger.openViewer()}
              className="font-mono text-[11px] font-semibold text-signal-ai underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              View detailed error logs →
            </button>
          </div>
        )}

        <button
          onClick={() => handleAnalyzeWithFile(file)}
          disabled={!file || scanning}
          className="w-full rounded-xl bg-ink py-3.5 font-display text-[15px] font-medium text-paper
            transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-30
            hover:opacity-90 focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {scanning ? "Analyzing…" : "Analyze image"}
        </button>
      </main>

      {/* Manual Token Configuration Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-[420px] rounded-2xl border border-paper-line bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-[16px] font-semibold text-ink">
                Hugging Face Token
              </h3>
              <button
                onClick={() => setShowTokenModal(false)}
                className="text-ink-soft hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
              Providing a free Read Access Token gives you higher ZeroGPU quotas on Hugging Face Spaces and prevents anonymous rate limits.
            </p>
            <div className="mt-4">
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Access Token (starts with hf_)
              </label>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded-xl border border-paper-line bg-white px-3 py-2 font-mono text-[12px] text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent hover:underline"
              >
                Create token on HF ↗
              </a>
              <div className="flex gap-2">
                {activeToken && (
                  <button
                    type="button"
                    onClick={() => {
                      setTokenInput("");
                      setHfToken("");
                      setActiveToken("");
                      setShowTokenModal(false);
                    }}
                    className="rounded-xl border border-paper-line px-3 py-1.5 text-[12px] font-medium text-signal-ai hover:bg-signal-ai-soft transition-colors"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = tokenInput.trim();
                    setHfToken(trimmed);
                    setActiveToken(trimmed);
                    setShowTokenModal(false);
                  }}
                  className="rounded-xl bg-ink px-4 py-1.5 text-[12px] font-medium text-paper hover:bg-ink/90 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="py-6 text-center font-mono text-[11px] text-ink-soft">
        College project · results are for demonstration purposes
      </footer>
    </div>
  );
}
