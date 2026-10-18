import React, { act } from "react";
import { createRoot } from "react-dom/client";
import WhatsApp from "./WhatsApp";
import WhatsAppAttachment, { whatsappDeliveryLabel } from "../components/WhatsAppAttachment";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: { get: jest.fn(), post: jest.fn(), defaults: { baseURL: "https://crm.example/api" } },
  asArray: (value) => Array.isArray(value) ? value : [],
  formatApiError: (value) => String(value || "Error"), relTime: () => "now",
  requestErrorMessage: (error) => error?.code === "ECONNABORTED" ? "The connection timed out. Please try again." : error?.response?.data?.detail || error?.message || "Request failed",
}));
jest.mock("react-router-dom", () => ({ Link: ({ children }) => <span>{children}</span>, useParams: () => ({}) }), { virtual: true });
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin", role: "admin" } }) }));
jest.mock("@/components/ui/dialog", () => ({ Dialog: () => null, DialogContent: () => null, DialogHeader: () => null, DialogTitle: () => null }));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() } }));

let container, root;
global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  URL.createObjectURL = jest.fn(() => "blob:attachment");
  URL.revokeObjectURL = jest.fn();
  api.get.mockImplementation(async (path) => ({ data: path === "/whatsapp/conversations" ? [
    { id: "a", contact_name: "Alice" }, { id: "b", contact_name: "Bob" },
  ] : path.includes("/messages") ? [] : {} }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("inbox polling preserves the selected conversation", async () => {
  await act(async () => root.render(<WhatsApp />));
  const bob = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Bob"));
  await act(async () => bob.click());
  expect(container.querySelector("header").textContent).toContain("Bob");
  await act(async () => jest.advanceTimersByTime(5000));
  expect(container.querySelector("header").textContent).toContain("Bob");
});

test("unlinked contacts can be sent a reply through the selected conversation", async () => {
  await act(async () => root.render(<WhatsApp />));
  const field = container.querySelector("textarea");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, "Hello contact");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => container.querySelector('button[title="Send message"]').click());
  expect(api.post).toHaveBeenCalledWith("/whatsapp/conversations/a/messages", { text: "Hello contact" }, { timeout: 60000 });
});

test("profile errors do not hide received conversations", async () => {
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((path) => path === "/whatsapp/profile" ? Promise.reject(new Error("Unavailable")) : original(path));
  await act(async () => root.render(<WhatsApp />));
  expect(container.textContent).toContain("Alice");
  expect(container.textContent).toContain("Bob");
});

test("Connect allows enough time for instance preparation and webhook registration", async () => {
  api.post.mockResolvedValue({ data: { status: "ready", connection_state: "open" } });
  await act(async () => root.render(<WhatsApp />));
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent.includes("Connect WhatsApp"));
  await act(async () => button.click());
  expect(api.post).toHaveBeenCalledWith("/whatsapp/connect", {}, { timeout: 55000 });
});

test("Connect timeout remains visible instead of a generic error", async () => {
  api.post.mockRejectedValue({ code: "ECONNABORTED" });
  await act(async () => root.render(<WhatsApp />));
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent.includes("Connect WhatsApp"));
  await act(async () => button.click());
  expect(container.querySelector('[role="alert"]').textContent).toBe("The connection timed out. Please try again.");
});

test("HTTP 200 provider errors stop Connect before QR loading", async () => {
  api.post.mockResolvedValue({ data: { status: "provider_error", message: "Wrong WhatsApp API address" } });
  await act(async () => root.render(<WhatsApp />));
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent.includes("Connect WhatsApp"));
  await act(async () => button.click());
  expect(container.querySelector('[role="alert"]').textContent).toBe("Wrong WhatsApp API address");
  expect(api.get.mock.calls.some(([path]) => path === "/whatsapp/qrcode")).toBe(false);
});

test("HTTP 200 QR provider errors retain their actual message", async () => {
  api.post.mockResolvedValue({ data: { status: "ready" } });
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((path) => path === "/whatsapp/qrcode" ? Promise.resolve({ data: { status: "provider_error", message: "Provider instance does not exist" } }) : original(path));
  await act(async () => root.render(<WhatsApp />));
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent.includes("Connect WhatsApp"));
  await act(async () => button.click());
  expect(container.querySelector('[role="alert"]').textContent).toBe("Provider instance does not exist");
});

test("profile provider errors show their reason", async () => {
  const original = api.get.getMockImplementation();
  api.get.mockImplementation((path) => path === "/whatsapp/profile" ? Promise.resolve({ data: { connection_error: "Evolution API returned HTTP 401" } }) : original(path));
  await act(async () => root.render(<WhatsApp />));
  expect(container.querySelector('[role="alert"]').textContent).toBe("Evolution API returned HTTP 401");
});

test("attachment download uses authenticated API and releases its object URL", async () => {
  api.get.mockResolvedValue({ data: new Blob(["file"], { type: "application/pdf" }) });
  await act(async () => root.render(<WhatsAppAttachment message={{ id: "media", media_path: "/whatsapp/messages/media/media", filename: "file.pdf", message_type: "document" }} />));
  await act(async () => container.querySelector("button").click());
  expect(api.get).toHaveBeenCalledWith("/whatsapp/messages/media/media", { responseType: "blob", timeout: 45000 });
  expect(container.querySelector("a").href).toBe("blob:attachment");
  await act(async () => root.unmount());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:attachment");
  root = createRoot(container);
});

test.each([["pending", "Pending"], ["read", "Read"], ["delivery_ack", "Delivered"], ["provider_error", "Failed"], [0, "Failed"]])("delivery status %s is shown accurately", (status, expected) => {
  expect(whatsappDeliveryLabel(status)).toBe(expected);
});
