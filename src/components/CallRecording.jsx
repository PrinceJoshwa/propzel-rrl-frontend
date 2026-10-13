import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";

function getRecordingUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export default function CallRecording({ url, compact = false }) {
  const recordingUrl = getRecordingUrl(url);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => setUnavailable(false), [recordingUrl]);

  if (!url) return <span className="text-xs text-forest/45">No recording</span>;
  if (!recordingUrl) return <span className="text-xs text-clay">Recording link unavailable.</span>;

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      {unavailable ? (
        <span className="text-xs text-clay">Playback unavailable. The link may have expired or use an unsupported format.</span>
      ) : (
        <audio
          controls
          preload="none"
          src={recordingUrl}
          onError={() => setUnavailable(true)}
          className="h-8 max-w-full"
          style={{ width: compact ? 220 : 260 }}
          aria-label="Call recording"
        />
      )}
      <a
        href={recordingUrl}
        download
        rel="noreferrer"
        title="Download recording (when supported by the recording host)"
        aria-label="Download call recording"
        className="h-8 w-8 shrink-0 border border-[#E6E4DD] rounded-sm inline-flex items-center justify-center text-forest hover:border-forest"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
