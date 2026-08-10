import { describe, expect, it } from "vitest";
import { flattenTransferItems, hostedTransferId, startHostedTransfer } from "./transferCompanion";

describe("hosted transfer helpers", () => {
  it("accepts only supported download links", () => {
    expect(hostedTransferId("https://storage.to/c/Abc_123-x")).toBe("t-Abc_123-x");
    expect(hostedTransferId("https://evil.example/c/Abc_123-x")).toBe("");
    expect(hostedTransferId("not a url")).toBe("");
  });

  it("flattens folder items without reading file bytes", () => {
    const loose = new File(["one"], "one.txt");
    const nested = new File(["two"], "two.txt");
    expect(flattenTransferItems([{ kind: "file", file: loose }, { kind: "folder", files: [nested] }])).toEqual([loose, nested]);
  });

  it("rejects transfers above the public size limit before uploading", async () => {
    await expect(startHostedTransfer({ items: [{ kind: "file", file: { name: "large.bin", size: 25 * 1024 ** 3 + 1 } }] }))
      .rejects.toThrow("up to 25 GB");
  });

  it("rejects invalid burn-after-download limits before uploading", async () => {
    const item = { kind: "file", file: new File(["one"], "one.txt") };
    await expect(startHostedTransfer({ items: [item], maxDownloads: 1001 }))
      .rejects.toThrow("between 1 and 1000");
  });
});
