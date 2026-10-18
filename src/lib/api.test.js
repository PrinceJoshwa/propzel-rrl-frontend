import { AxiosError } from "axios";
import { api, setAuthTokens, clearAuthTokens, requestErrorMessage } from "./api";

jest.mock("axios", () => jest.requireActual("../../node_modules/axios/dist/node/axios.cjs"));

const respond = (config, data = {}, status = 200) => ({ config, data, status, statusText: "OK", headers: {} });
const reject401 = (config) => Promise.reject(new AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, {}, respond(config, { detail: "Token expired" }, 401)));
beforeEach(() => {
  localStorage.clear();
  setAuthTokens({ access_token: "old-access", refresh_token: "valid-refresh" });
});
afterEach(() => { clearAuthTokens(); jest.restoreAllMocks(); });

test("expired access token refreshes through JSON and retries Connect once", async () => {
  api.defaults.adapter = jest.fn(async (config) => {
    if (config.url === "/auth/refresh") {
      expect(JSON.parse(config.data)).toEqual({ refresh_token: "valid-refresh" });
      return respond(config, { access_token: "new-access", refresh_token: "new-refresh" });
    }
    if (config.headers.Authorization === "Bearer old-access") return reject401(config);
    expect(config.headers.Authorization).toBe("Bearer new-access");
    return respond(config, { status: "ready" });
  });
  const response = await api.post("/whatsapp/connect", {});
  expect(response.data.status).toBe("ready");
  expect(api.defaults.adapter.mock.calls.filter(([c]) => c.url === "/auth/refresh")).toHaveLength(1);
});

test("parallel unauthorized requests share one refresh", async () => {
  api.defaults.adapter = jest.fn(async (config) => {
    if (config.url === "/auth/refresh") return respond(config, { access_token: "new-access", refresh_token: "new-refresh" });
    if (config.headers.Authorization === "Bearer old-access") return reject401(config);
    return respond(config, { ok: true });
  });
  await Promise.all([api.get("/auth/me"), api.get("/whatsapp/profile"), api.post("/whatsapp/connect", {})]);
  expect(api.defaults.adapter.mock.calls.filter(([c]) => c.url === "/auth/refresh")).toHaveLength(1);
});

test("invalid refresh clears credentials and reports an expired session", async () => {
  const expired = jest.fn();
  window.addEventListener("propzel:session-expired", expired);
  api.defaults.adapter = jest.fn(reject401);
  await expect(api.get("/auth/me")).rejects.toMatchObject({ response: { status: 401 } });
  expect(localStorage.getItem("propzel.accessToken")).toBeNull();
  expect(localStorage.getItem("propzel.refreshToken")).toBeNull();
  expect(expired).toHaveBeenCalledTimes(1);
  expect(api.defaults.adapter.mock.calls).toHaveLength(2);
  window.removeEventListener("propzel:session-expired", expired);
});

test("login errors do not trigger a refresh", async () => {
  api.defaults.adapter = jest.fn(reject401);
  await expect(api.post("/auth/login", {})).rejects.toMatchObject({ response: { status: 401 } });
  expect(api.defaults.adapter.mock.calls).toHaveLength(1);
});

test("a request still unauthorized after refresh is not retried indefinitely", async () => {
  api.defaults.adapter = jest.fn(async (config) => config.url === "/auth/refresh" ? respond(config, { access_token: "new-access" }) : reject401(config));
  await expect(api.get("/auth/me")).rejects.toMatchObject({ response: { status: 401 } });
  expect(api.defaults.adapter.mock.calls).toHaveLength(3);
});

test("a temporary refresh failure does not erase a valid refresh token", async () => {
  api.defaults.adapter = jest.fn(async (config) => {
    if (config.url === "/auth/refresh") throw new AxiosError("Timeout", "ECONNABORTED", config);
    return reject401(config);
  });
  await expect(api.get("/auth/me")).rejects.toMatchObject({ code: "ECONNABORTED" });
  expect(localStorage.getItem("propzel.refreshToken")).toBe("valid-refresh");
});

test.each([
  [{ response: { status: 401 } }, "Your session expired. Please sign in again."],
  [{ code: "ECONNABORTED" }, "The connection timed out. Please try again."],
  [{ isAxiosError: true, message: "Network Error" }, "Could not reach the backend. Check your connection and try again."],
  [{ response: { status: 502, data: { detail: "Evolution API returned HTTP 401" } } }, "Evolution API returned HTTP 401"],
])("request failures expose a useful message", (error, message) => {
  expect(requestErrorMessage(error)).toBe(message);
});
