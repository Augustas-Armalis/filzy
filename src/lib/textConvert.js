import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { formatByValue, normalizeFormatValue, sourceValueOf } from "@/lib/formats";

const TEXT_SOURCES = new Set([
  "txt", "md", "html", "csv", "json", "xml", "yaml",
  "srt", "vtt", "ass", "ssa", "sbv", "lrc", "ttml", "dfxp",
]);
const SUBTITLE_SOURCES = new Set(["srt", "vtt", "ass", "ssa", "sbv", "lrc", "ttml", "dfxp"]);

function abortError() {
  return new DOMException("Conversion cancelled", "AbortError");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function outputName(file, target) {
  return `${file.name.replace(/\.[^.]+$/, "") || "file"}.${target}`;
}

function result(file, target, value) {
  return {
    name: outputName(file, target),
    blob: new Blob([value], { type: formatByValue(target)?.mime || "text/plain" }),
  };
}

function markdownToHtml(markdown) {
  const inline = (value) => escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_|\*([^*]+)\*/g, "<em>$1$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const body = [];
  let listOpen = false;
  for (const line of lines) {
    const list = line.match(/^\s*[-*]\s+(.+)$/);
    if (list) {
      if (!listOpen) { body.push("<ul>"); listOpen = true; }
      body.push(`<li>${inline(list[1])}</li>`);
      continue;
    }
    if (listOpen) { body.push("</ul>"); listOpen = false; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) body.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (line.trim()) body.push(`<p>${inline(line)}</p>`);
  }
  if (listOpen) body.push("</ul>");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>Converted by Filzy</title></head><body>\n${body.join("\n")}\n</body></html>\n`;
}

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((node) => node.remove());
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p,div,h1,h2,h3,h4,h5,h6,li,tr").forEach((node) => node.append("\n"));
  return (doc.body.textContent || "").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((node) => node.remove());
  doc.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((node) => {
    const level = Number(node.tagName.slice(1));
    node.replaceWith(`${"#".repeat(level)} ${node.textContent.trim()}\n\n`);
  });
  doc.querySelectorAll("li").forEach((node) => node.replaceWith(`- ${node.textContent.trim()}\n`));
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p,div,ul,ol").forEach((node) => node.append("\n\n"));
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (char !== "\r") cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [headers = [], ...body] = rows;
  return body.filter((cells) => cells.some((value) => value !== "")).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, cells[index] ?? ""])),
  );
}

function csvCell(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(value) {
  const rows = Array.isArray(value) ? value : [value];
  const records = rows.map((row) => row && typeof row === "object" && !Array.isArray(row) ? row : { value: row });
  const headers = [...new Set(records.flatMap((row) => Object.keys(row)))];
  return `${headers.map(csvCell).join(",")}\n${records.map((row) => headers.map((key) => csvCell(row[key])).join(",")).join("\n")}\n`;
}

function jsonToXml(value) {
  const node = (key, item) => {
    const safeKey = String(key).replace(/[^A-Za-z0-9_.-]/g, "_").replace(/^[^A-Za-z_]/, "_$&") || "item";
    if (Array.isArray(item)) return item.map((entry) => node(safeKey, entry)).join("");
    if (item && typeof item === "object") return `<${safeKey}>${Object.entries(item).map(([childKey, child]) => node(childKey, child)).join("")}</${safeKey}>`;
    return `<${safeKey}>${escapeXml(item ?? "")}</${safeKey}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>${value && typeof value === "object" ? Object.entries(value).map(([key, item]) => node(key, item)).join("") : node("value", value)}</root>\n`;
}

function xmlToJson(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The XML file is not valid");
  const read = (element) => {
    const children = [...element.children];
    if (!children.length) return element.textContent || "";
    const out = {};
    for (const child of children) {
      const value = read(child);
      if (Object.hasOwn(out, child.tagName)) out[child.tagName] = Array.isArray(out[child.tagName]) ? [...out[child.tagName], value] : [out[child.tagName], value];
      else out[child.tagName] = value;
    }
    return out;
  };
  return { [doc.documentElement.tagName]: read(doc.documentElement) };
}

function parseTime(value) {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return parts[0] * 1000;
}

function parseSubtitle(text, source) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (source === "ass" || source === "ssa") {
    return normalized.split("\n").filter((line) => /^Dialogue:/i.test(line)).map((line) => {
      const parts = line.replace(/^Dialogue:\s*/i, "").split(",");
      const start = parseTime(parts[1]);
      const end = parseTime(parts[2]);
      return { start, end, text: parts.slice(9).join(",").replace(/\\N/g, "\n").replace(/\{[^}]*\}/g, "") };
    }).filter((cue) => cue.start != null && cue.end != null);
  }
  if (source === "lrc") {
    const lines = normalized.split("\n").flatMap((line) => [...line.matchAll(/\[(\d{1,3}:\d{2}(?:\.\d+)?)\]/g)].map((match) => ({ start: parseTime(match[1]), text: line.slice(line.lastIndexOf("]") + 1).trim() })));
    return lines.map((cue, index) => ({ ...cue, end: lines[index + 1]?.start ?? cue.start + 3000 }));
  }
  if (source === "ttml" || source === "dfxp") {
    const doc = new DOMParser().parseFromString(normalized, "application/xml");
    if (doc.querySelector("parsererror")) throw new Error("The TTML file is not valid");
    return [...doc.querySelectorAll("p")].map((node) => ({ start: parseTime(node.getAttribute("begin") || ""), end: parseTime(node.getAttribute("end") || ""), text: node.textContent.trim() })).filter((cue) => cue.start != null && cue.end != null);
  }
  const timing = source === "sbv" ? /^(\d[^\n]*),(\d[^\n]*)$/m : /^(\d[^\n]*?)\s+-->\s+(\d[^\n ]*)/m;
  return normalized.replace(/^WEBVTT[^\n]*\n+/i, "").split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => timing.test(line));
    if (timingIndex < 0) return null;
    const match = lines[timingIndex].match(timing);
    return { start: parseTime(match[1]), end: parseTime(match[2]), text: lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, "") };
  }).filter((cue) => cue && cue.start != null && cue.end != null);
}

function formatTime(ms, comma = false) {
  const total = Math.max(0, ms) / 1000;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const millis = Math.round((total - Math.floor(total)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${comma ? "," : "."}${String(millis).padStart(3, "0")}`;
}

function formatShortTime(ms, decimals = 2) {
  const total = Math.max(0, ms) / 1000;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = (total % 60).toFixed(decimals).padStart(2 + (decimals ? decimals + 1 : 0), "0");
  return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
}

function writeSubtitle(cues, target) {
  if (target === "txt") return `${cues.map((cue) => cue.text).join("\n\n")}\n`;
  if (target === "ass" || target === "ssa") {
    const styleVersion = target === "ass" ? "V4+" : "V4";
    const style = target === "ass"
      ? "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1"
      : "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,2,10,10,10,1";
    const eventsFormat = target === "ass"
      ? "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
      : "Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";
    const dialogues = cues.map((cue) => `Dialogue: ${target === "ass" ? "0" : "Marked=0"},${formatShortTime(cue.start)},${formatShortTime(cue.end)},Default,,0,0,0,,${cue.text.replace(/\n/g, "\\N")}`).join("\n");
    return `[Script Info]\nScriptType: v4.00+\nCollisions: Normal\nPlayResX: 1920\nPlayResY: 1080\n\n[${styleVersion} Styles]\n${style}\n\n[Events]\n${eventsFormat}\n${dialogues}\n`;
  }
  if (target === "sbv") return `${cues.map((cue) => `${formatShortTime(cue.start, 3)},${formatShortTime(cue.end, 3)}\n${cue.text}`).join("\n\n")}\n`;
  if (target === "lrc") return `${cues.map((cue) => {
    const total = Math.max(0, cue.start) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = (total % 60).toFixed(2).padStart(5, "0");
    return `[${String(minutes).padStart(2, "0")}:${seconds}]${cue.text.replace(/\n/g, " ")}`;
  }).join("\n")}\n`;
  if (target === "ttml" || target === "dfxp") {
    const body = cues.map((cue) => `      <p begin="${formatTime(cue.start)}" end="${formatTime(cue.end)}">${escapeXml(cue.text).replace(/\n/g, "<br/>")}</p>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml"><body><div>\n${body}\n</div></body></tt>\n`;
  }
  const body = cues.map((cue, index) => `${index + 1}\n${formatTime(cue.start, target === "srt")} --> ${formatTime(cue.end, target === "srt")}\n${cue.text}`).join("\n\n");
  return target === "vtt" ? `WEBVTT\n\n${body}\n` : `${body}\n`;
}

export function isTextConversion(file, target) {
  return TEXT_SOURCES.has(normalizeFormatValue(sourceValueOf(file))) && TEXT_SOURCES.has(normalizeFormatValue(target));
}

export async function convertTextFile(file, target, { signal, onProgress } = {}) {
  const source = normalizeFormatValue(sourceValueOf(file));
  const normalizedTarget = normalizeFormatValue(target);
  if (signal?.aborted) throw abortError();
  if (source === normalizedTarget) return { blob: file, name: file.name };
  const text = await file.text();
  if (signal?.aborted) throw abortError();
  onProgress?.(0.35);

  if (SUBTITLE_SOURCES.has(source)) {
    const cues = parseSubtitle(text, source);
    if (!cues.length) throw new Error("No subtitle cues were found");
    onProgress?.(0.75);
    return result(file, normalizedTarget, writeSubtitle(cues, normalizedTarget));
  }

  let value;
  if (source === "md") value = normalizedTarget === "html" ? markdownToHtml(text) : text.replace(/[#*_`>~-]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  else if (source === "html") value = normalizedTarget === "md" ? htmlToMarkdown(text) : htmlToText(text);
  else if (source === "txt") value = normalizedTarget === "html" ? markdownToHtml(text) : text;
  else {
    const data = source === "json" ? JSON.parse(text)
      : source === "yaml" ? parseYaml(text, { maxAliasCount: 100 })
        : source === "xml" ? xmlToJson(text)
          : parseCsv(text);
    if (normalizedTarget === "json") value = `${JSON.stringify(data, null, 2)}\n`;
    else if (normalizedTarget === "yaml") value = stringifyYaml(data, { indent: 2 });
    else if (normalizedTarget === "xml") value = jsonToXml(data);
    else if (normalizedTarget === "csv") value = toCsv(data);
    else if (normalizedTarget === "html") {
      const records = Array.isArray(data) ? data : [data];
      const headers = [...new Set(records.flatMap((row) => Object.keys(row || {})))];
      value = `<!doctype html><html><head><meta charset="utf-8"><title>Converted by Filzy</title></head><body><table><thead><tr>${headers.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead><tbody>${records.map((row) => `<tr>${headers.map((key) => `<td>${escapeHtml(typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>\n`;
    } else value = typeof data === "string" ? data : `${JSON.stringify(data, null, 2)}\n`;
  }
  onProgress?.(1);
  return result(file, normalizedTarget, value);
}
