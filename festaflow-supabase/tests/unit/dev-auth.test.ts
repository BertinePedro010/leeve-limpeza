import { describe, it, expect } from "vitest";
import { isDeveloperUserId } from "@/lib/dev-auth";

// Deliberately contains hex letters (not all-digit) so .toUpperCase() below
// actually produces a different string - an all-digit fixture like
// "1111...1111" would make that assertion vacuous (toUpperCase() is a no-op
// on digits), silently testing nothing.
const developerUuid = "aaaaaaaa-1111-1111-1111-111111111111";
const otherUuid = "bbbbbbbb-2222-2222-2222-222222222222";

describe("isDeveloperUserId", () => {
  it("returns true only for an exact match against the configured developer UUID", () => {
    expect(isDeveloperUserId(developerUuid, developerUuid)).toBe(true);
  });

  it("returns false for any other user id, even a syntactically valid UUID", () => {
    expect(isDeveloperUserId(otherUuid, developerUuid)).toBe(false);
  });

  it("returns false when the developer UUID is not configured at all (missing env var)", () => {
    expect(isDeveloperUserId(developerUuid, undefined)).toBe(false);
    expect(isDeveloperUserId(developerUuid, "")).toBe(false);
  });

  it("returns false for a null/undefined userId, even if a developer UUID is configured", () => {
    expect(isDeveloperUserId(null, developerUuid)).toBe(false);
    expect(isDeveloperUserId(undefined, developerUuid)).toBe(false);
  });

  it("never grants access via case-insensitive or partial matches", () => {
    expect(isDeveloperUserId(developerUuid.toUpperCase(), developerUuid)).toBe(false);
    expect(isDeveloperUserId(developerUuid.slice(0, -1), developerUuid)).toBe(false);
  });
});
