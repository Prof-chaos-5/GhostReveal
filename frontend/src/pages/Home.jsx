import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import ScanUploader from "../components/ScanUploader";
import { predictImage } from "../lib/api";
import { logger } from "../lib/logger";

export default function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [pickError, setPickError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [scanning, setScanning] = useState(false);

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

  const handleAnalyze = async () => {
    if (!file || scanning) return;
    setScanning(true);
    setSubmitError(null);
    logger.info(`Starting analysis for image "${file.name}"...`);

    try {
      const result = await predictImage(file);
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
      logger.error(`Analysis failed for "${file.name}": ${err.message}`, err);
      setSubmitError(err.message);
      setScanning(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6">
      <header className="flex items-center justify-between py-8">
        <Logo />
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

        {submitError && (
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
          onClick={handleAnalyze}
          disabled={!file || scanning}
          className="w-full rounded-xl bg-ink py-3.5 font-display text-[15px] font-medium text-paper
            transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-30
            hover:opacity-90 focus-visible:outline focus-visible:outline-2
            focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {scanning ? "Analyzing…" : "Analyze image"}
        </button>
      </main>

      <footer className="py-6 text-center font-mono text-[11px] text-ink-soft">
        College project · results are for demonstration purposes
      </footer>
    </div>
  );
}
