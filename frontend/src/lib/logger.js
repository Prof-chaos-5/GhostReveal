// In-memory log buffer and event emitter for GhostReveal frontend logs
const MAX_LOGS = 250;
const logs = [];
const listeners = new Set();
let isLogViewerOpen = false;
const viewerListeners = new Set();

function notify() {
  const snapshot = [...logs];
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.error("[GhostReveal Logger] Listener error:", err);
    }
  });
}

function notifyViewerState() {
  viewerListeners.forEach((fn) => {
    try {
      fn(isLogViewerOpen);
    } catch {
      // ignore
    }
  });
}

function formatDetail(detail) {
  if (detail === undefined || detail === null) return undefined;
  if (detail instanceof Error) {
    return {
      name: detail.name,
      message: detail.message,
      stack: detail.stack,
    };
  }
  return detail;
}

function addEntry(level, message, details) {
  const formattedDetails = formatDetail(details);
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: timeStr,
    timestamp: now.toISOString(),
    level,
    message: typeof message === "string" ? message : (message?.message || JSON.stringify(message)),
    details: formattedDetails,
  };

  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  // Print directly to the browser DevTools console with clean tagging
  const tag = `[GhostReveal]`;
  if (level === "error") {
    if (details !== undefined) {
      console.error(`${tag} ❌ ${entry.message}`, details);
    } else {
      console.error(`${tag} ❌ ${entry.message}`);
    }
  } else if (level === "warn") {
    if (details !== undefined) {
      console.warn(`${tag} ⚠️ ${entry.message}`, details);
    } else {
      console.warn(`${tag} ⚠️ ${entry.message}`);
    }
  } else {
    if (details !== undefined) {
      console.log(`${tag} ℹ️ ${entry.message}`, details);
    } else {
      console.log(`${tag} ℹ️ ${entry.message}`);
    }
  }

  notify();
}

// Global browser error listeners to automatically catch uncaught errors
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    addEntry("error", `Uncaught Script Error: ${e.message || "Unknown error"}`, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      error: e.error ? formatDetail(e.error) : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    addEntry("error", `Unhandled Promise Rejection: ${e.reason?.message || e.reason || "Unknown reason"}`, {
      reason: formatDetail(e.reason),
    });
  });
}

export const logger = {
  info: (msg, details) => addEntry("info", msg, details),
  log: (msg, details) => addEntry("info", msg, details),
  warn: (msg, details) => addEntry("warn", msg, details),
  error: (msg, details) => addEntry("error", msg, details),
  getLogs: () => [...logs],
  clear: () => {
    logs.length = 0;
    notify();
  },
  subscribe: (fn) => {
    listeners.add(fn);
    fn([...logs]);
    return () => listeners.delete(fn);
  },
  openViewer: () => {
    isLogViewerOpen = true;
    notifyViewerState();
  },
  closeViewer: () => {
    isLogViewerOpen = false;
    notifyViewerState();
  },
  toggleViewer: () => {
    isLogViewerOpen = !isLogViewerOpen;
    notifyViewerState();
  },
  subscribeViewer: (fn) => {
    viewerListeners.add(fn);
    fn(isLogViewerOpen);
    return () => viewerListeners.delete(fn);
  },
};
