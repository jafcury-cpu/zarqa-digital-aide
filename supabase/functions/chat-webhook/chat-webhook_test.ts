import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";

const DEFAULT_ALLOWED_HOST_PATTERNS = ["n8n.cloud", "*.n8n.cloud"];
const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function getAllowedHostPatterns() {
  return DEFAULT_ALLOWED_HOST_PATTERNS;
}

function isPrivateOrUnsafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(normalized)) {
    return true;
  }

  if (!ipv4Pattern.test(normalized)) {
    return false;
  }

  const octets = normalized.split(".").map(Number);
  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function hostnameMatchesPattern(hostname: string, pattern: string) {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return normalizedHost !== suffix && normalizedHost.endsWith(`.${suffix}`);
  }

  return normalizedHost === normalizedPattern;
}

function validateWebhookUrl(value: string) {
  const parsedUrl = new URL(value);

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Somente webhooks com HTTPS são permitidos.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("Webhook URL não pode incluir credenciais embutidas.");
  }

  if (isPrivateOrUnsafeHostname(parsedUrl.hostname)) {
    throw new Error("O domínio do webhook não é permitido.");
  }

  const allowedPatterns = getAllowedHostPatterns();
  const isAllowed = allowedPatterns.some((pattern) => hostnameMatchesPattern(parsedUrl.hostname, pattern));

  if (!isAllowed) {
    throw new Error("O domínio do webhook não está na allowlist configurada.");
  }

  return parsedUrl;
}

Deno.test("aceita domínios allowlistados via wildcard", () => {
  assertEquals(validateWebhookUrl("https://demo.n8n.cloud/webhook/test").hostname, "demo.n8n.cloud");
});

Deno.test("bloqueia localhost e IP privado", () => {
  assertThrows(() => validateWebhookUrl("https://localhost/webhook"));
  assertThrows(() => validateWebhookUrl("https://192.168.1.20/webhook"));
});

Deno.test("bloqueia http e domínios fora da allowlist", () => {
  assertThrows(() => validateWebhookUrl("http://demo.n8n.cloud/webhook"));
  assertThrows(() => validateWebhookUrl("https://example.com/webhook"));
});