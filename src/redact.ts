const SECRET_KEY = /(^|_)(authorization|cookie|set_cookie|password|passwd|secret|token|access_token|refresh_token|ticket|session|captcha|sms_code|verify_code)($|_)/i;
const PERSONAL_KEY = /(^|_)(phone|mobile|id_card|identity_no|recipient|consignee|address|real_name)($|_)/i;

export function isSensitiveKey(key: string): boolean {
  return SECRET_KEY.test(key) || PERSONAL_KEY.test(key);
}
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[DEPTH_LIMIT]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? "[REDACTED]" : redact(child, depth + 1);
    }
    return output;
  }
  if (typeof value === "string" && value.length > 2_000) {
    return `${value.slice(0, 2_000)}[TRUNCATED]`;
  }
  return value;
}

export function parseAndRedact(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return redact(JSON.parse(raw));
  } catch {
    const params = new URLSearchParams(raw);
    if ([...params.keys()].length > 0) {
      return Object.fromEntries(
        [...params.entries()].map(([key, value]) => [key, isSensitiveKey(key) ? "[REDACTED]" : value]),
      );
    }
    return raw.length > 2_000 ? `${raw.slice(0, 2_000)}[TRUNCATED]` : raw;
  }
}

export function shapeOf(value: unknown, depth = 0): unknown {
  if (depth > 6) return "depth-limit";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return { type: "array", length: value.length, item: value.length ? shapeOf(value[0], depth + 1) : "unknown" };
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, child]) => [key, isSensitiveKey(key) ? "redacted" : shapeOf(child, depth + 1)]),
    );
  }
  return typeof value;
}
