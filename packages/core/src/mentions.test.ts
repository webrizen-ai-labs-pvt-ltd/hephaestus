import { describe, expect, it } from "vitest";
import { extractMentions, mentionToken, previewText } from "./mentions.ts";

const a = "0190a0f3-0000-7000-8000-000000000001";
const b = "0190a0f3-0000-7000-8000-000000000002";

describe("mentions", () => {
  it("extracts unique member ids", () => {
    expect(extractMentions(`Hi ${mentionToken(a)} and ${mentionToken(b)}, ${mentionToken(a)} again`)).toEqual([a, b]);
    expect(extractMentions("no mentions, @[member:not-a-uuid]")).toEqual([]);
  });

  it("previews with names and truncates", () => {
    expect(previewText(`Ping ${mentionToken(a)}\n\nplease`, { [a]: "Priya" })).toBe("Ping @Priya please");
    expect(previewText("x".repeat(200), {}, 10)).toBe("xxxxxxxxx…");
  });
});
