import { describe, expect, it } from "vitest";
import { flattenTransferItems, swissTransferId, swissTransferUrl } from "./swissCompanion";

describe("SwissTransfer companion helpers", () => {
  it("accepts only SwissTransfer download links", () => {
    expect(swissTransferId("https://www.swisstransfer.com/d/Abc_123-x")).toBe("Abc_123-x");
    expect(swissTransferId("https://evil.example/d/Abc_123-x")).toBe("");
    expect(swissTransferId("not a url")).toBe("");
  });

  it("reconstructs the official SwissTransfer URL", () => {
    expect(swissTransferUrl("Abc_123-x")).toBe("https://www.swisstransfer.com/d/Abc_123-x");
  });

  it("flattens folder items without reading file bytes", () => {
    const loose = new File(["one"], "one.txt");
    const nested = new File(["two"], "two.txt");
    expect(flattenTransferItems([{ kind: "file", file: loose }, { kind: "folder", files: [nested] }])).toEqual([loose, nested]);
  });
});
