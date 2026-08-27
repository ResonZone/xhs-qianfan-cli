import { describe, expect, it } from "vitest";
import { parseAndRedact, redact, shapeOf } from "../src/redact.js";

describe("redaction", () => {
  it("redacts nested authentication and personal fields", () => {
    expect(redact({ token: "secret", nested: { mobile: "13800000000", productName: "tea" } })).toEqual({
      token: "[REDACTED]",
      nested: { mobile: "[REDACTED]", productName: "tea" },
    });
  });

  it("parses form bodies without leaking secrets", () => {
    expect(parseAndRedact("page=1&access_token=abc")).toEqual({ page: "1", access_token: "[REDACTED]" });
  });

  it("retains only response structure", () => {
    expect(shapeOf({ data: [{ id: 1, recipient: "Alice" }], ok: true })).toEqual({
      data: { type: "array", length: 1, item: { id: "number", recipient: "redacted" } },
      ok: "boolean",
    });
  });
});
