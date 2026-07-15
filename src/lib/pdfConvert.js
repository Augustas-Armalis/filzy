import { extOf } from "@/lib/formats";

function abortError() {
  return new DOMException("Conversion cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function imageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode this image"));
    };
    image.src = url;
  });
}

async function normalizeImage(file, signal) {
  const extension = extOf(file);
  if (extension === "png" || file.type === "image/png") return { bytes: await file.arrayBuffer(), kind: "png" };
  if (["jpg", "jpeg"].includes(extension) || file.type === "image/jpeg") return { bytes: await file.arrayBuffer(), kind: "jpg" };

  throwIfAborted(signal);
  let decoded;
  try {
    decoded = await createImageBitmap(file);
  } catch {
    decoded = await imageElement(file);
  }
  throwIfAborted(signal);
  const width = decoded.width || decoded.naturalWidth;
  const height = decoded.height || decoded.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(decoded, 0, 0, width, height);
  decoded.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare image for PDF")), "image/png"));
  return { bytes: await blob.arrayBuffer(), kind: "png" };
}

export async function imageToPdf(file, { signal, onProgress } = {}) {
  throwIfAborted(signal);
  const normalized = await normalizeImage(file, signal);
  onProgress?.(0.4);
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const image = normalized.kind === "jpg" ? await pdf.embedJpg(normalized.bytes) : await pdf.embedPng(normalized.bytes);
  throwIfAborted(signal);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  onProgress?.(0.75);
  const bytes = await pdf.save({ useObjectStreams: true });
  throwIfAborted(signal);
  onProgress?.(1);
  return {
    name: `${file.name.replace(/\.[^.]+$/, "") || "image"}.pdf`,
    blob: new Blob([bytes], { type: "application/pdf" }),
  };
}
