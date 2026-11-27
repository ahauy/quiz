import { describe, expect, it } from "vitest";
import { parseCreateRequest, parseListQuery, parseWriteRequest } from "./exam-dto.js";

const id = "00000000-0000-4000-8000-000000000001";
const mutationId = "00000000-0000-4000-8000-000000000002";

describe("exam request DTOs", () => {
  it("applies PostgreSQL text safety to create and settings titles", () => {
    for (const title of ["bad\0title", "lone\ud800surrogate"]) {
      expect(() => parseCreateRequest({ id, mutationId, title })).toThrow();
      expect(() => parseWriteRequest({ op: "saveSettings", mutationId, settings: { title } })).toThrow();
    }
  });

  it("requires an own known operation and valid password instructions", () => {
    expect(() => parseWriteRequest({ op: "toString", mutationId })).toThrow();
    for (const password of [null, "set", { mode: "set", value: "" }, { mode: "set", value: "x", ignored: true }]) {
      expect(() => parseWriteRequest({ op: "saveSettings", mutationId, settings: { password } })).toThrow();
    }
    expect(() => parseWriteRequest({ op: "saveSettings", mutationId, settings: { password: { mode: "disable" } } })).not.toThrow();
  });

  it("rejects an empty cursor instead of treating it as page one", () => {
    expect(() => parseListQuery({ cursor: "" })).toThrow();
  });
});
