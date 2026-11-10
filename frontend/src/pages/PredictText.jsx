import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import { predictText, MAX_TEXT_CHARS } from "../lib/textApi";
import { logger } from "../lib/logger";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default function PredictText() {
  const [text, setText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    if (scanning) return;
    setScanning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    try {
      setResult(await predictText(text, (p) => setProgress(Math.round(p.percent))));
    } catch (err) {
      logger.error(`Text analysis failed: ${err.message}`, err);
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const isAi = result?.class_id === 1;
  const signal = isAi
    ? { label: "AI GENERATED", text: "text-signal-ai", bg: "bg-signal-ai-soft", bar: "bg-signal-ai" }
    : { label: "HUMAN WRITTEN", text: "text-signal-real", bg: "bg-signal-real-soft", bar: "bg-signal-real" };

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6">
      <header className="flex items-center justify-between py-8">
        <Logo />
        <Link
          to="/"
          className="rounded-full border border-paper-line bg-white/70 px-3 py-1 font-mono text-[11px] text-ink-soft transition-colors hover:bg-white hover:text-ink"
        >
          Image detector
        </Link>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-6 pb-16">
        <div className="text-center">
          <h1 className="font-display text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]">
            Who wrote this?
          </h1>
          <p className="mx-auto mt-3 max-w-[40ch] text-[15px] text-ink-soft">
            Paste some text and GhostReveal will tell you whether it looks human-written or AI-generated. It runs in
            your browser; your text is never uploaded.
          </p>
        </div>

        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TEXT_CHARS}
            rows={9}
            placeholder="Paste your text here..."
            className="w-full resize-y rounded-2xl border border-paper-line bg-white px-4 py-3 text-[14px] leading-relaxed text-ink placeholder:text-ink-soft/50 focus:border-accent focus:outline-none"
          />
          <div className="mt-1 text-right font-mono text-[11px] text-ink-soft">
            {text.length} / {MAX_TEXT_CHARS}
          </div>
        </div>

        {scanning && progress !== null && progress < 100 && (
          <div className="-mt-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-line">
              <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-center font-mono text-[11px] text-ink-soft">
              Downloading model (first visit only): {progress}%
            </p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-signal-ai/30 bg-signal-ai-soft p-3 text-center">
            <p className="text-[13px] font-medium text-signal-ai">{error}</p>
            <button
              type="button"
              onClick={() => logger.openViewer()}
              className="font-mono text-[11px] font-semibold text-signal-ai underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              View detailed error logs →
            </button>
          </div>
        )}

        
        <div className="flex-row items-center justify-center  mt-0">
          <button
            onClick={handleAnalyze}
            disabled={!text.trim() || scanning}
            className="w-full rounded-xl bg-ink py-3.5 font-display text-[15px] font-medium text-paper
              transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-30
              hover:opacity-90 focus-visible:outline focus-visible:outline-2
              focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {scanning ? "Analyzing…" : "Analyze text"}
          </button>

          <div className="flex items-center justify-center">
            <Link
              to="/"
              className="group mt-5 inline-flex items-center gap-2
                text-sm font-medium text-slate-500
                transition-colors duration-200
                hover:text-indigo-600
                focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-indigo-500
                focus-visible:ring-offset-4 rounded-md"
            >
              <span>Want to check image instead?</span>

              <span className="inline-flex items-center gap-1 font-semibold text-indigo-600
                group-hover:gap-2 transition-all duration-200">
                Analyze image
                <span className="transition-transform duration-200
                  group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          </div>
        </div>

        {result && (
          <section aria-live="polite" className={`rounded-2xl p-5 ${signal.bg}`}>
            <p className={`font-mono text-[11px] font-semibold tracking-widest ${signal.text}`}>{signal.label}</p>
            <p className="mt-1 font-display text-[28px] font-semibold">{pct(result.confidence)} confidence</p>

            <div className="mt-4 space-y-3 text-[13px]">
              <div>
                <div className="flex justify-between">
                  <span>Human-written</span>
                  <span className="font-mono">{pct(result.probabilities.human)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full bg-signal-real" style={{ width: pct(result.probabilities.human) }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between">
                  <span>AI-generated</span>
                  <span className="font-mono">{pct(result.probabilities.ai)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/70">
                  <div className="h-full bg-signal-ai" style={{ width: pct(result.probabilities.ai) }} />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
