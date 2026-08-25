import { describe, expect, it } from "vitest";
import { safeLoginTarget, shouldRenderDemoHint } from "./login-target";

describe("login target safety (post-login navigation)", () => {
  it("uses middleware-provided internal path as-is", () => {
    expect(safeLoginTarget("/admin/runs")).toBe("/admin/runs");
  });

  it("falls back to /admin when from is missing", () => {
    expect(safeLoginTarget(undefined)).toBe("/admin");
    expect(safeLoginTarget(null)).toBe("/admin");
    expect(safeLoginTarget("")).toBe("/admin");
  });

  it("blocks open redirects (protocol-relative and absolute URLs)", () => {
    expect(safeLoginTarget("https://evil.example")).toBe("/admin");
    expect(safeLoginTarget("//evil.example")).toBe("/admin");
    expect(safeLoginTarget("/\\evil.example")).toBe("/admin");
  });
});

describe("production credential messaging gate", () => {
  it("hides .env.local/demo hint in production builds", () => {
    expect(shouldRenderDemoHint("production")).toBe(false);
  });

  it("keeps the developer hint outside production", () => {
    expect(shouldRenderDemoHint("development")).toBe(true);
    expect(shouldRenderDemoHint(undefined)).toBe(true);
  });

  it("message files no longer carry the demo-credential string (regression F)", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    for (const locale of ["en", "fa"]) {
      const messages = JSON.parse(fs.readFileSync(path.join(process.cwd(), "messages", `${locale}.json`), "utf8"));
      // The LOGIN page must have no demo-credential hint at all.
      expect(messages.admin?.login?.demoHint).toBeUndefined();
      // And the raw translation payload must not carry .env.local references.
      const rawPath = path.join(process.cwd(), "messages", `${locale}.json`);
      const raw = fs.readFileSync(rawPath, "utf8");
      expect(raw).not.toContain(".env.local");
      expect(raw).not.toContain("Default credentials are set");
    }
  });
});
