import { useEffect, useState, useMemo } from "react";
import { logger } from "../lib/logger";

export default function LogViewer() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all"); // 'all' | 'error' | 'warn'
  const [copied, setCopied] = useState(false);
  const [expandedIds, setExpandedIds] = useState(new Set());

  useEffect(() => {
    const unsubLogs = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    const unsubViewer = logger.subscribeViewer((open) => {
      setIsOpen(open);
    });
    return () => {
      unsubLogs();
      unsubViewer();
    };
  }, []);

  const errorCount = useMemo(
    () => logs.filter((l) => l.level === "error").length,
    [logs]
  );
  const warnCount = useMemo(
    () => logs.filter((l) => l.level === "warn").length,
    [logs]
  );

  const filteredLogs = useMemo(() => {
    if (filter === "error") return logs.filter((l) => l.level === "error");
    if (filter === "warn") return logs.filter((l) => l.level === "warn");
    return logs;
  }, [logs, filter]);

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async () => {
    try {
      const text = filteredLogs
        .map((l) => {
          let str = `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`;
          if (l.details) {
            str += `\nDetails: ${typeof l.details === "object" ? JSON.stringify(l.details, null, 2) : l.details}`;
          }
          return str;
        })
        .join("\n\n");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleClear = () => {
    logger.clear();
  };

  return (
    <>
      {/* Floating Logs Trigger Button */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => logger.toggleViewer()}
          aria-label="Toggle frontend logs viewer"
          className="flex items-center gap-2 rounded-full border border-ink/15 bg-ink px-3.5 py-2 text-[12px] font-medium text-paper shadow-lg backdrop-blur-md transition-all hover:bg-ink/90 active:scale-95"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          <span>Logs</span>

          {errorCount > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-signal-ai px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {errorCount} {errorCount === 1 ? "err" : "errs"}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-paper/70">
              {logs.length}
            </span>
          )}
        </button>
      </div>

      {/* Slide-over or Modal Log Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-xs">
          <div
            className="flex h-full w-full max-w-[560px] flex-col bg-paper shadow-2xl border-l border-paper-line"
            role="dialog"
            aria-modal="true"
            aria-label="Frontend Logs Panel"
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-paper-line px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-paper">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-display text-[15px] font-semibold text-ink">
                    Frontend Logs
                  </h2>
                  <p className="text-[11px] text-ink-soft">
                    Real-time client & network logs
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  title="Copy logs to clipboard"
                  className="rounded-lg border border-paper-line bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-white active:scale-95"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={handleClear}
                  title="Clear in-memory logs"
                  className="rounded-lg border border-paper-line bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:bg-white active:scale-95"
                >
                  Clear
                </button>
                <button
                  onClick={() => logger.closeViewer()}
                  aria-label="Close logs drawer"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-paper-line bg-white/70 text-ink transition-colors hover:bg-white active:scale-95"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 border-b border-paper-line/70 bg-white/30 px-5 py-2">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === "all"
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:text-ink hover:bg-black/5"
                }`}
              >
                All ({logs.length})
              </button>
              <button
                onClick={() => setFilter("error")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === "error"
                    ? "bg-signal-ai text-white"
                    : "text-signal-ai hover:bg-signal-ai-soft"
                }`}
              >
                Errors ({errorCount})
              </button>
              <button
                onClick={() => setFilter("warn")}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                  filter === "warn"
                    ? "bg-amber-600 text-white"
                    : "text-amber-800 hover:bg-amber-100/50"
                }`}
              >
                Warnings ({warnCount})
              </button>
            </div>

            {/* Logs List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px]">
              {filteredLogs.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-ink-soft">
                  <p>No {filter !== "all" ? filter : ""} logs recorded yet.</p>
                  <p className="mt-1 text-[10px] text-ink-soft/70">
                    Interact with the app to generate logs.
                  </p>
                </div>
              ) : (
                filteredLogs.map((entry) => {
                  const isError = entry.level === "error";
                  const isWarn = entry.level === "warn";
                  const isExpanded = expandedIds.has(entry.id);

                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border p-2.5 transition-colors ${
                        isError
                          ? "border-signal-ai/40 bg-signal-ai-soft/50 text-signal-ai"
                          : isWarn
                          ? "border-amber-400/40 bg-amber-50 text-amber-900"
                          : "border-paper-line bg-white/70 text-ink"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                              isError
                                ? "bg-signal-ai text-white"
                                : isWarn
                                ? "bg-amber-600 text-white"
                                : "bg-ink/10 text-ink"
                            }`}
                          >
                            {entry.level}
                          </span>
                          <span className="text-[10px] opacity-60">
                            {entry.time}
                          </span>
                        </div>
                        {entry.details && (
                          <button
                            onClick={() => toggleExpand(entry.id)}
                            className="text-[10px] font-semibold underline underline-offset-2 opacity-75 hover:opacity-100"
                          >
                            {isExpanded ? "Hide details ▲" : "View details ▼"}
                          </button>
                        )}
                      </div>

                      <p className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">
                        {entry.message}
                      </p>

                      {isExpanded && entry.details && (
                        <pre className="mt-2 max-h-48 overflow-auto rounded bg-ink/90 p-2 text-[10px] text-emerald-300">
                          {typeof entry.details === "object"
                            ? JSON.stringify(entry.details, null, 2)
                            : String(entry.details)}
                        </pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Panel Footer */}
            <div className="border-t border-paper-line bg-white/50 px-5 py-2.5 text-[11px] text-ink-soft flex items-center justify-between">
              <span>Also logged to browser DevTools console</span>
              <button
                onClick={() => logger.closeViewer()}
                className="font-medium text-ink hover:underline"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
