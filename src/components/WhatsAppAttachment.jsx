import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

function safeMediaUrl(value) {
  if (!value) return "";
  try {
    const base = new URL(api.defaults.baseURL, window.location.origin);
    const url = new URL(value, base.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

export function whatsappDeliveryLabel(status) {
  const value = String(status ?? "").toLowerCase();
  if (["failed", "error", "provider_error", "0"].includes(value)) return "Failed";
  if (["read", "played", "4", "5"].includes(value)) return "Read";
  if (["delivered", "delivery_ack", "3"].includes(value)) return "Delivered";
  if (["pending", "pending_provider", "pending_credentials", "1"].includes(value)) return "Pending";
  return "Sent";
}

export default function WhatsAppAttachment({ message }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const objectUrl = useRef("");
  const disposed = useRef(false);
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  const mediaUrl = url || (!message.media_path && safeMediaUrl(message.media_url));
  const type = message.message_type || message.type;
  const hasMedia = message.media_path || message.media_url || message.filename || message.media_error;
  if (!hasMedia) return null;

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/whatsapp/messages/${message.id}/media`, { responseType: "blob", timeout: 45000 });
      if (!disposed.current) {
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(response.data);
        setUrl(objectUrl.current);
      }
    } catch {
      if (!disposed.current) setError("Could not load the attachment. Try again.");
    } finally {
      if (!disposed.current) setLoading(false);
    }
  };
  return <div className="space-y-1 mb-1">
    {mediaUrl ? <>
      {type === "image" && <img src={mediaUrl} alt={message.filename || "WhatsApp attachment"} className="max-h-56 max-w-full rounded-md object-contain" />}
      {type === "audio" && <audio controls preload="none" src={mediaUrl} className="max-w-full" />}
      {type === "video" && <video controls preload="metadata" src={mediaUrl} className="max-h-56 max-w-full rounded-md" />}
      <a href={mediaUrl} download={message.filename || "attachment"} target="_blank" rel="noreferrer" className="text-sm underline">{message.filename || "Download attachment"}</a>
    </> : message.media_path ? <button type="button" onClick={load} disabled={loading} className="text-sm underline disabled:opacity-50">{loading ? "Loading attachment…" : `Open ${message.filename || "attachment"}`}</button>
      : <div className="text-xs opacity-75">{message.media_error || `${message.filename || "Attachment"} — preview unavailable`}</div>}
    {error && <div role="alert" className="text-xs">{error}</div>}
  </div>;
}
