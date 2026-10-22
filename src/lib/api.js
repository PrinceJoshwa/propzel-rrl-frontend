import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
const ACCESS_TOKEN_KEY = "propzel.accessToken";
const REFRESH_TOKEN_KEY = "propzel.refreshToken";

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: true,
  timeout: 20000,
});

export function setAuthTokens({ access_token, refresh_token }) {
  if (access_token) localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, refresh_token);
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const organizationId = localStorage.getItem("propzel.activeOrganizationId");
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  // Bootstrap endpoints must remain reachable even when a browser holds an
  // organisation ID that was deleted or belongs to an older environment.
  // Otherwise `/organizations` is rejected before the UI can repair it.
  const path = String(config.url || "").split("?")[0];
  const unscopedEndpoints = ["/auth/me", "/auth/login", "/auth/logout", "/auth/refresh", "/organizations", "/super-admin"];
  const isUnscoped = unscopedEndpoints.some((endpoint) => path === endpoint || path.startsWith(`${endpoint}/`));
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (organizationId && !isUnscoped && !config.headers["X-Organization-Id"]) config.headers["X-Organization-Id"] = organizationId;
  return config;
});

let refreshPromise = null;
api.interceptors.response.use((response) => response, async (error) => {
  const request = error.config;
  const path = String(request?.url || "").split("?")[0];
  if (error.response?.status !== 401 || !request || request._authRetried || request._skipAuthRefresh ||
      ["/auth/login", "/auth/logout", "/auth/refresh"].includes(path)) {
    return Promise.reject(error);
  }
  request._authRetried = true;
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  // A parallel request may already have renewed the session.
  if (accessToken && request.headers?.Authorization && request.headers.Authorization !== `Bearer ${accessToken}`) {
    return api(request);
  }
  try {
    if (!refreshPromise) {
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      refreshPromise = api.post("/auth/refresh", refreshToken ? { refresh_token: refreshToken } : {}, { _skipAuthRefresh: true })
        .then(({ data }) => setAuthTokens(data))
        .finally(() => { refreshPromise = null; });
    }
    await refreshPromise;
    return api(request);
  } catch (refreshError) {
    if ([401, 403].includes(refreshError.response?.status)) {
      clearAuthTokens();
      window.dispatchEvent(new Event("propzel:session-expired"));
    }
    return Promise.reject(refreshError);
  }
});

export function requestErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (detail != null) return formatApiError(detail);
  if (error?.response?.status === 401) return "Your session expired. Please sign in again.";
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") return "The connection timed out. Please try again.";
  if (!error?.response) return !error?.isAxiosError && error?.message ? error.message : "Could not reach the backend. Check your connection and try again.";
  return error.response.data?.message || error.message || "Request failed. Please try again.";
}

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

export function inr(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
}

export function relTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Math.abs(diff) < 60) return "just now";
  const mins = diff / 60;
  if (Math.abs(mins) < 60) return `${Math.round(mins)}m ${diff > 0 ? "ago" : "ahead"}`;
  const hrs = mins / 60;
  if (Math.abs(hrs) < 24) return `${Math.round(hrs)}h ${diff > 0 ? "ago" : "ahead"}`;
  const days = hrs / 24;
  if (Math.abs(days) < 30) return `${Math.round(days)}d ${diff > 0 ? "ago" : "ahead"}`;
  return d.toLocaleDateString();
}

const CRM_TIME_ZONE = "Asia/Kolkata";

export function formatISTDateTime(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CRM_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

export function formatISTTime(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: CRM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatScheduledActivityMessage(activity) {
  const message = String(activity?.message || "");
  if (!["followup_scheduled", "site_visit_scheduled"].includes(activity?.kind)) return message;
  return message.replace(
    /(scheduled at\s+)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))/i,
    (_, prefix, timestamp) => `${prefix}${formatISTDateTime(timestamp)}`,
  );
}

export const SOURCE_LABEL = {
  magicbricks: "MagicBricks",
  "99acres": "99acres",
  commonfloor: "CommonFloor",
  housing: "Housing.com",
  website: "Website",
  jagathi_website: "Jagathi Website",
  google_ads: "Google Ads",
  facebook: "Facebook",
  instagram: "Instagram",
  referral: "Referral",
  walk_in: "Walk-in",
  manual: "Manual",
};

export const STAGE_META = [
  { key: "new", label: "New", tone: "#5C6661" },
  { key: "contacted", label: "Contacted", tone: "#457B9D" },
  { key: "contacted_dnp", label: "Contacted DNP", tone: "#6B7280" },
  { key: "qualified", label: "Qualified", tone: "#2D6A4F" },
  { key: "qualified_dnp", label: "Qualified DNP", tone: "#64748B" },
  { key: "site_visit", label: "Site Visit", tone: "#D4A373" },
  { key: "site_visit_dnp", label: "Site Visit DNP", tone: "#A16207" },
  { key: "negotiation", label: "Negotiation", tone: "#C25934" },
  { key: "negotiation_dnp", label: "Negotiation DNP", tone: "#9A3412" },
  { key: "booked", label: "Booked", tone: "#102A20" },
  { key: "lost", label: "Lost", tone: "#B03A2E" },
];

export const STAGE_LABEL = Object.fromEntries(STAGE_META.map((s) => [s.key, s.label]));
