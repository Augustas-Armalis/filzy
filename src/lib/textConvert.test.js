// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { convertTextFile } from "@/lib/textConvert";
import { enabledOutputValuesForFile } from "@/lib/formats";
import { imageToPdf } from "@/lib/pdfConvert";

async function convert(name, contents, target, type = "text/plain") {
  return convertTextFile(new File([contents], name, { type }), target);
}

describe("browser-native structured conversions", () => {
  it("converts JSON records to a correctly escaped CSV", async () => {
    const output = await convert(
      "records.json",
      JSON.stringify([{ name: "Filzy", note: "fast, private" }, { name: "Beam", note: "send" }]),
      "csv",
      "application/json",
    );

    expect(output.name).toBe("records.csv");
    expect(await output.blob.text()).toBe('name,note\nFilzy,"fast, private"\nBeam,send\n');
  });

  it("converts CSV back to JSON records", async () => {
    const output = await convert("records.csv", 'name,note\nFilzy,"fast, private"\n', "json", "text/csv");
    expect(JSON.parse(await output.blob.text())).toEqual([{ name: "Filzy", note: "fast, private" }]);
  });

  it("converts YAML to formatted JSON", async () => {
    const output = await convert("config.yaml", "name: Filzy\nfeatures:\n  - Beam\n  - Convert\n", "json", "application/yaml");
    expect(JSON.parse(await output.blob.text())).toEqual({ name: "Filzy", features: ["Beam", "Convert"] });
  });

  it("converts Markdown to a standalone HTML document", async () => {
    const output = await convert("readme.md", "# Filzy\n\n- Beam\n- Convert\n", "html", "text/markdown");
    const html = await output.blob.text();
    expect(html).toContain("<h1>Filzy</h1>");
    expect(html).toContain("<li>Beam</li>");
  });

  it("converts SubRip cues to WebVTT", async () => {
    const output = await convert("captions.srt", "1\n00:00:01,000 --> 00:00:03,500\nHello Filzy\n", "vtt", "application/x-subrip");
    expect(await output.blob.text()).toBe("WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nHello Filzy\n");
  });

  it("converts SubRip cues to ASS and TTML-family output", async () => {
    const source = "1\n00:00:01,000 --> 00:00:03,500\nHello Filzy\n";
    const ass = await convert("captions.srt", source, "ass", "application/x-subrip");
    expect(await ass.blob.text()).toContain("Dialogue: 0,0:00:01.00,0:00:03.50");
    const ttml = await convert("captions.srt", source, "ttml", "application/x-subrip");
    expect(await ttml.blob.text()).toContain('<p begin="00:00:01.000" end="00:00:03.500">Hello Filzy</p>');
  });
});

describe("image documents", () => {
  it("creates a valid PDF from PNG bytes", async () => {
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nkwAAAAASUVORK5CYII="), (character) => character.charCodeAt(0));
    const output = await imageToPdf(new File([png], "pixel.png", { type: "image/png" }));
    const signature = new TextDecoder().decode((await output.blob.arrayBuffer()).slice(0, 4));
    expect(output.name).toBe("pixel.pdf");
    expect(signature).toBe("%PDF");
  });
});

describe("source-specific availability", () => {
  it("offers executable JSON targets first without enabling media formats", () => {
    const values = enabledOutputValuesForFile(new File(["{}"], "data.json", { type: "application/json" }));
    expect([...values]).toEqual(["json", "yaml", "xml", "csv", "html", "txt"]);
    expect(values.has("png")).toBe(false);
  });

  it("always permits same-format pass-through for unknown catalogue inputs", () => {
    const values = enabledOutputValuesForFile(new File(["font"], "custom.woff2", { type: "font/woff2" }));
    expect(values.has("woff2")).toBe(true);
  });
});
