// Local conversion formats plus the broader catalog used by the Convert UI.
// The catalog mirrors CloudConvert's public 212-format grouping (2026-07-15),
// but capability is explicit: disabled catalog entries are visible road-map
// items, never fake conversion promises.

export const CATEGORIES = ["image", "audio", "video", "text", "structured", "tabular", "subtitle"];

export const FORMATS = [
  { value: "png", label: "PNG", mime: "image/png", category: "image", group: "image" },
  { value: "jpg", label: "JPG", mime: "image/jpeg", category: "image", group: "image" },
  { value: "webp", label: "WEBP", mime: "image/webp", category: "image", group: "image" },
  { value: "avif", label: "AVIF", mime: "image/avif", category: "image", group: "image" },
  { value: "gif", label: "GIF", mime: "image/gif", category: "image", group: "image" },
  { value: "bmp", label: "BMP", mime: "image/bmp", category: "image", group: "image" },
  { value: "tiff", label: "TIFF", mime: "image/tiff", category: "image", group: "image" },
  { value: "ico", label: "ICO", mime: "image/x-icon", category: "image", group: "image" },
  { value: "ppm", label: "PPM", mime: "image/x-portable-pixmap", category: "image", group: "image" },
  { value: "tga", label: "TGA", mime: "image/x-tga", category: "image", group: "image" },
  { value: "svg", label: "SVG", mime: "image/svg+xml", category: "image", group: "vector" },
  { value: "mp3", label: "MP3", mime: "audio/mpeg", category: "audio", group: "audio" },
  { value: "wav", label: "WAV", mime: "audio/wav", category: "audio", group: "audio" },
  { value: "ogg", label: "OGG", mime: "audio/ogg", category: "audio", group: "audio" },
  { value: "m4a", label: "M4A", mime: "audio/mp4", category: "audio", group: "audio" },
  { value: "aac", label: "AAC", mime: "audio/aac", category: "audio", group: "audio" },
  { value: "flac", label: "FLAC", mime: "audio/flac", category: "audio", group: "audio" },
  { value: "opus", label: "OPUS", mime: "audio/opus", category: "audio", group: "audio" },
  { value: "mp4", label: "MP4", mime: "video/mp4", category: "video", group: "video" },
  { value: "webm", label: "WEBM", mime: "video/webm", category: "video", group: "video" },
  { value: "mov", label: "MOV", mime: "video/quicktime", category: "video", group: "video" },
  { value: "mkv", label: "MKV", mime: "video/x-matroska", category: "video", group: "video" },
  { value: "avi", label: "AVI", mime: "video/x-msvideo", category: "video", group: "video" },
  { value: "txt", label: "TXT", mime: "text/plain", category: "text", group: "document" },
  { value: "md", label: "MD", mime: "text/markdown", category: "text", group: "document" },
  { value: "html", label: "HTML", mime: "text/html", category: "text", group: "document" },
  { value: "json", label: "JSON", mime: "application/json", category: "structured", group: "document" },
  { value: "xml", label: "XML", mime: "application/xml", category: "structured", group: "document" },
  { value: "yaml", label: "YAML", mime: "application/yaml", category: "structured", group: "document" },
  { value: "csv", label: "CSV", mime: "text/csv", category: "tabular", group: "spreadsheet" },
  { value: "pdf", label: "PDF", mime: "application/pdf", category: "pdf", group: "document" },
  { value: "srt", label: "SRT", mime: "application/x-subrip", category: "subtitle", group: "subtitle" },
  { value: "vtt", label: "VTT", mime: "text/vtt", category: "subtitle", group: "subtitle" },
  { value: "ass", label: "ASS", mime: "text/x-ssa", category: "subtitle", group: "subtitle" },
  { value: "ssa", label: "SSA", mime: "text/x-ssa", category: "subtitle", group: "subtitle" },
  { value: "sbv", label: "SBV", mime: "text/plain", category: "subtitle", group: "subtitle" },
  { value: "lrc", label: "LRC", mime: "text/plain", category: "subtitle", group: "subtitle" },
  { value: "ttml", label: "TTML", mime: "application/ttml+xml", category: "subtitle", group: "subtitle" },
  { value: "dfxp", label: "DFXP", mime: "application/ttml+xml", category: "subtitle", group: "subtitle" },
];

export const FORMAT_GROUP_META = {
  document: { label: "Documents" },
  image: { label: "Images" },
  video: { label: "Video" },
  audio: { label: "Audio" },
  spreadsheet: { label: "Spreadsheets" },
  presentation: { label: "Presentations" },
  ebook: { label: "E-books" },
  archive: { label: "Archives" },
  vector: { label: "Vector" },
  cad: { label: "CAD" },
  font: { label: "Fonts" },
  subtitle: { label: "Subtitles" },
};

export const FORMAT_GROUPS = [
  { id: "document", values: ["abw", "djvu", "doc", "docm", "docx", "dot", "dotx", "html", "hwp", "hwpx", "json", "lwp", "md", "odt", "pages", "pdf", "rst", "rtf", "sdw", "tex", "txt", "wpd", "wps", "xml", "yaml", "zabw"] },
  { id: "image", values: ["3fr", "arw", "avif", "bmp", "cr2", "cr3", "crw", "dcr", "dng", "eps", "erf", "gif", "heic", "heif", "icns", "ico", "jfif", "jpeg", "jpg", "mos", "mrw", "nef", "odd", "odg", "orf", "pef", "png", "ppm", "ps", "psb", "psd", "pub", "raf", "raw", "rw2", "tga", "tif", "tiff", "webp", "x3f", "xcf", "xps"] },
  { id: "video", values: ["3g2", "3gp", "3gpp", "avi", "cavs", "dv", "dvr", "flv", "m2ts", "m4v", "mkv", "mod", "mov", "mp4", "mpeg", "mpg", "mts", "mxf", "ogg", "ogv", "rm", "rmvb", "swf", "ts", "vob", "webm", "wmv", "wtv"] },
  { id: "audio", values: ["aac", "ac3", "aif", "aifc", "aiff", "amr", "au", "caf", "dss", "flac", "m4a", "m4b", "mp3", "oga", "opus", "sf2", "sfark", "voc", "wav", "weba", "wma"] },
  { id: "spreadsheet", values: ["csv", "et", "numbers", "ods", "sdc", "xls", "xlsm", "xlsx"] },
  { id: "presentation", values: ["dps", "key", "odp", "pot", "potx", "pps", "ppsx", "ppt", "pptm", "pptx", "sda"] },
  { id: "ebook", values: ["azw", "azw3", "azw4", "cbc", "cbr", "cbz", "chm", "epub", "fb2", "htm", "htmlz", "lit", "lrf", "mobi", "oeb", "pdb", "pml", "prc", "rb", "snb", "tcr", "txtz"] },
  { id: "archive", values: ["7z", "ace", "alz", "arc", "arj", "bz", "bz2", "cab", "cpio", "deb", "dmg", "eml", "gz", "img", "iso", "jar", "lha", "lz", "lzma", "lzo", "rar", "rpm", "rz", "tar", "tar.7z", "tar.bz", "tar.bz2", "tar.gz", "tar.lzo", "tar.xz", "tar.z", "tbz", "tbz2", "tgz", "tz", "tzo", "xz", "z", "zip"] },
  { id: "vector", values: ["ai", "cdr", "cgm", "emf", "sk", "sk1", "svg", "svgz", "vsd", "wmf"] },
  { id: "cad", values: ["dwf", "dwg", "dxf"] },
  { id: "font", values: ["eot", "otf", "ttf", "woff", "woff2"] },
  { id: "subtitle", values: ["ass", "dfxp", "lrc", "sbv", "srt", "ssa", "sub", "ttml", "vtt"] },
];

export const POPULAR_FORMAT_VALUES = [
  "png", "jpg", "webp", "gif", "svg", "mp4", "webm", "mov", "mp3", "wav", "m4a", "csv", "json", "pdf", "docx", "xlsx", "pptx", "zip",
];

const BY_VALUE = Object.fromEntries(FORMATS.map((format) => [format.value, format]));
const ALIAS = { jpeg: "jpg", tif: "tiff", qt: "mov", oga: "ogg" };
const LOCAL_OUTPUTS = new Set(FORMATS.map((format) => format.value));
const MEDIA_INPUT_GROUPS = new Set(["image", "audio", "video"]);

export const OUTPUTS_BY_SOURCE = {
  txt: ["txt", "md", "html"],
  md: ["md", "html", "txt"],
  html: ["html", "txt", "md"],
  csv: ["csv", "json", "html", "txt"],
  json: ["json", "yaml", "xml", "csv", "html", "txt"],
  xml: ["xml", "json", "yaml", "csv", "html", "txt"],
  yaml: ["yaml", "json", "xml", "csv", "html", "txt"],
  srt: ["srt", "vtt", "ass", "ssa", "sbv", "lrc", "ttml", "dfxp", "txt"],
  vtt: ["vtt", "srt", "ass", "ssa", "sbv", "lrc", "ttml", "dfxp", "txt"],
  ass: ["ass", "ssa", "srt", "vtt", "sbv", "lrc", "ttml", "dfxp", "txt"],
  ssa: ["ssa", "ass", "srt", "vtt", "sbv", "lrc", "ttml", "dfxp", "txt"],
  sbv: ["sbv", "srt", "vtt", "ass", "ssa", "lrc", "ttml", "dfxp", "txt"],
  lrc: ["lrc", "srt", "vtt", "ass", "ssa", "sbv", "ttml", "dfxp", "txt"],
  ttml: ["ttml", "dfxp", "srt", "vtt", "ass", "ssa", "sbv", "lrc", "txt"],
  dfxp: ["dfxp", "ttml", "srt", "vtt", "ass", "ssa", "sbv", "lrc", "txt"],
};

export function normalizeFormatValue(value) {
  return ALIAS[value] || value;
}

export const FORMAT_CATALOG = FORMAT_GROUPS.flatMap(({ id, values }) => values.map((value) => {
  const local = BY_VALUE[normalizeFormatValue(value)];
  const inputAvailable = MEDIA_INPUT_GROUPS.has(id) || value === "svg";
  const outputAvailable = LOCAL_OUTPUTS.has(normalizeFormatValue(value)) && !["jpeg", "tif", "oga"].includes(value);
  return {
    value,
    label: value.toUpperCase(),
    group: id,
    category: local?.category || (MEDIA_INPUT_GROUPS.has(id) ? id : null),
    mime: local?.mime || "",
    inputAvailable,
    outputAvailable,
  };
}));

const CATALOG_BY_VALUE = Object.fromEntries(FORMAT_CATALOG.map((format) => [format.value, format]));
const SUFFIX_FORMATS = [...FORMAT_CATALOG].sort((a, b) => b.value.length - a.value.length);

export function formatByValue(value) {
  if (!value) return null;
  return BY_VALUE[normalizeFormatValue(value)] || null;
}

export function catalogFormatByValue(value) {
  if (!value) return null;
  return CATALOG_BY_VALUE[value] || CATALOG_BY_VALUE[normalizeFormatValue(value)] || null;
}

export function extOf(file) {
  return (file.name.split(".").pop() || "").toLowerCase();
}

export function detectCatalogFormat(file) {
  const name = (file.name || "").toLowerCase();
  const byName = SUFFIX_FORMATS.find((format) => name.endsWith(`.${format.value}`));
  if (byName) return byName;
  const mime = file.type || "";
  const local = FORMATS.find((format) => format.mime === mime);
  return local ? catalogFormatByValue(local.value) : null;
}

export function detectFormat(file) {
  const catalog = detectCatalogFormat(file);
  const local = catalog ? formatByValue(catalog.value) : null;
  if (local) return local;
  const mime = file.type || "";
  return FORMATS.find((format) => format.mime === mime) || null;
}

export function sourceValueOf(file) {
  return detectCatalogFormat(file)?.value || extOf(file) || "file";
}

export function categoryOf(file) {
  const local = detectFormat(file);
  if (local) return local.category;
  const catalog = detectCatalogFormat(file);
  if (catalog && MEDIA_INPUT_GROUPS.has(catalog.group)) return catalog.group;
  if (catalog?.value === "svg") return "image";
  const mime = file.type || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export function outputsFor(category) {
  if (!category) return [];
  const same = FORMATS.filter((format) => format.category === category);
  if (category === "image") return [...same, BY_VALUE.pdf];
  if (category === "video") {
    // Video can remain video, shed its video track into audio, or export a
    // still/animated image. SVG is intentionally excluded: tracing one
    // arbitrary video frame would be surprising rather than useful.
    const stills = FORMATS.filter((format) => format.category === "image" && format.value !== "svg");
    const audio = FORMATS.filter((format) => format.category === "audio");
    return [...same, ...stills, ...audio];
  }
  if (category === "text") return FORMATS.filter((format) => format.category === "text");
  if (category === "structured") return FORMATS.filter((format) => format.category === "structured" || format.category === "tabular" || format.value === "txt");
  if (category === "tabular") return FORMATS.filter((format) => ["csv", "json", "html", "txt"].includes(format.value));
  if (category === "subtitle") return FORMATS.filter((format) => format.category === "subtitle" || format.value === "txt");
  return same;
}

export function outputValuesForSourceValue(value) {
  const normalized = normalizeFormatValue(value);
  const exact = OUTPUTS_BY_SOURCE[normalized];
  if (exact) return new Set(exact);
  const format = formatByValue(normalized) || catalogFormatByValue(normalized);
  const values = new Set(outputsFor(format?.category).map((option) => option.value));
  if (normalized && normalized !== "any") values.add(normalized);
  return values;
}

export function enabledOutputValuesForFile(file) {
  const sourceValue = sourceValueOf(file);
  const exact = OUTPUTS_BY_SOURCE[normalizeFormatValue(sourceValue)];
  const values = exact
    ? new Set(exact)
    : new Set(outputsFor(categoryOf(file)).map((format) => format.value));
  if (normalizeFormatValue(sourceValueOf(file)) === "gif") {
    FORMATS.filter((format) => format.category === "video").forEach((format) => values.add(format.value));
  }
  values.add(sourceValue); // every file can be passed through unchanged
  return values;
}

export function pickerCatalog(enabledValues, mode = "output") {
  const enabled = enabledValues instanceof Set ? enabledValues : new Set(enabledValues || []);
  return FORMAT_CATALOG.map((format) => ({
    ...format,
    // Every catalog format can be selected as an input. Output capability is
    // stricter and communicated in-place with disabled “Soon” entries.
    disabled: mode === "input" ? false : !enabled.has(format.value),
  }));
}

export function fileMatchesFormat(file, value) {
  if (!value || value === "any") return true;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(`.${value}`) || normalizeFormatValue(sourceValueOf(file)) === normalizeFormatValue(value);
}

export function acceptForFormat(value) {
  if (!value || value === "any") return undefined;
  const mime = formatByValue(value)?.mime;
  return [`.${value}`, mime].filter(Boolean).join(",");
}

export const CANVAS_OUTPUTS = new Set(["png", "jpg", "webp", "avif"]);
export const CANVAS_INPUTS = new Set(["png", "jpg", "webp", "avif", "gif", "bmp", "svg", "ico"]);
export const CONVERT_ACCEPT = undefined;
