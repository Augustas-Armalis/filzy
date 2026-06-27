// Helpers for the upload UI: human file sizes, file-type classification,
// and recursive folder traversal for drag-and-drop.

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const n = bytes / k ** i;
  const rounded = i === 0 || n >= 10 ? Math.round(n) : n.toFixed(1);
  return `${rounded} ${units[i]}`;
}

// Returns a coarse kind used to pick an icon/thumbnail in the file list.
export function kindOf(file) {
  const type = file.type || "";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/") || ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) return "archive";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf", "pages", "ppt", "pptx", "key", "odp"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(ext)) return "sheet";
  if (["js", "jsx", "ts", "tsx", "json", "html", "css", "scss", "py", "java", "c", "cpp", "cs", "go", "rs", "rb", "php", "sh", "xml", "yml", "yaml", "sql"].includes(ext)) return "code";
  if (type.startsWith("text/") || ["txt", "md", "log"].includes(ext)) return "text";
  return "file";
}

function entryToFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

// Recursively read every file inside a directory entry (readEntries returns
// in batches, so we loop until a batch comes back empty).
async function readDirectory(dirEntry) {
  const reader = dirEntry.createReader();
  const readBatch = () => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  const files = [];
  let batch = await readBatch();
  while (batch.length > 0) {
    for (const entry of batch) {
      try {
        if (entry.isFile) files.push(await entryToFile(entry));
        else if (entry.isDirectory) files.push(...(await readDirectory(entry)));
      } catch {
        // Skip an unreadable entry rather than failing the whole folder.
      }
    }
    batch = await readBatch();
  }
  return files;
}

// Turns a drop's DataTransfer into a flat list of:
//   { type: "file", file }                     — a loose file
//   { type: "folder", name, files: File[] }    — a dropped folder + its contents
// Falls back to plain files when the entries API is unavailable.
export async function gatherDropItems(dataTransfer) {
  const dtItems = dataTransfer.items;
  const supportsEntries = dtItems && dtItems.length && typeof dtItems[0].webkitGetAsEntry === "function";
  if (!supportsEntries) {
    return Array.from(dataTransfer.files).map((file) => ({ type: "file", file }));
  }

  // webkitGetAsEntry() must be called synchronously — the entries expire once
  // the drop handler yields — so capture them all first, then read async.
  const entries = [];
  for (const it of dtItems) {
    const entry = it.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  const out = [];
  for (const entry of entries) {
    try {
      if (entry.isFile) {
        out.push({ type: "file", file: await entryToFile(entry) });
      } else if (entry.isDirectory) {
        out.push({ type: "folder", name: entry.name, files: await readDirectory(entry) });
      }
    } catch {
      // Skip an unreadable top-level entry; keep the rest of the drop.
    }
  }
  return out;
}
