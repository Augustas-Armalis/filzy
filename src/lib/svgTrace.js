import ImageTracer from "imagetracerjs";

const MAX_TRACE_EDGE = 4096;
const MAX_TRACE_PIXELS = 16_000_000;

const DETAIL_OPTIONS = {
  balanced: { ltres: 1.15, qtres: 1.15, pathomit: 10, roundcoords: 1 },
  strong: { ltres: 0.55, qtres: 0.55, pathomit: 4, roundcoords: 2 },
  maximum: { ltres: 0.18, qtres: 0.18, pathomit: 0, roundcoords: 3 },
};

export const SVG_TRACE_QUALITIES = [
  { id: "fast", label: "Fast · Balanced", detail: "balanced", resolution: 900, previewResolution: 900, colorquantcycles: 2 },
  { id: "fine", label: "Fine · Strong", detail: "strong", resolution: 1600, previewResolution: 1500, colorquantcycles: 4 },
  { id: "max", label: "Max · Maximum", detail: "maximum", resolution: "original", previewResolution: 2000, colorquantcycles: 6 },
];

const QUALITY_BY_ID = Object.fromEntries(SVG_TRACE_QUALITIES.map((quality) => [quality.id, quality]));

// These mirror the useful families in PicSVG, but each preset deliberately
// changes both path fitting and preprocessing so adjacent choices are visible.
const FILTER_OPTIONS = {
  edge1: { tracer: { linefilter: true, rightangleenhance: false, pathomit: 20, ltres: 1.6, qtres: 1.6 }, preprocess: { contrast: 1.02, backgroundTolerance: 18 } },
  edge2: { tracer: { linefilter: false, rightangleenhance: true, pathomit: 12, ltres: 1, qtres: 1 }, preprocess: { contrast: 1.1, backgroundTolerance: 25 } },
  edge3: { tracer: { linefilter: false, rightangleenhance: true, pathomit: 7, ltres: 0.72, qtres: 0.72 }, preprocess: { contrast: 1.18, backgroundTolerance: 29 } },
  edge4: { tracer: { linefilter: false, rightangleenhance: true, pathomit: 4, ltres: 0.5, qtres: 0.5 }, preprocess: { contrast: 1.28, backgroundTolerance: 32 } },
  edge5: { tracer: { linefilter: false, rightangleenhance: true, pathomit: 2, ltres: 0.32, qtres: 0.32 }, preprocess: { contrast: 1.4, backgroundTolerance: 35 } },
  edge6: { tracer: { linefilter: false, rightangleenhance: true, pathomit: 0, ltres: 0.16, qtres: 0.16 }, preprocess: { contrast: 1.55, backgroundTolerance: 38 } },
  internal1: { tracer: { layering: 1, linefilter: true, rightangleenhance: false, pathomit: 18, ltres: 1.5, qtres: 1.5 }, preprocess: { contrast: 1.02, backgroundTolerance: 18, invert: true } },
  internal2: { tracer: { layering: 1, linefilter: false, rightangleenhance: true, pathomit: 11, ltres: 0.95, qtres: 0.95 }, preprocess: { contrast: 1.1, backgroundTolerance: 24, invert: true } },
  internal3: { tracer: { layering: 1, linefilter: false, rightangleenhance: true, pathomit: 6, ltres: 0.64, qtres: 0.64 }, preprocess: { contrast: 1.2, backgroundTolerance: 29, invert: true } },
  internal4: { tracer: { layering: 1, linefilter: false, rightangleenhance: true, pathomit: 3, ltres: 0.4, qtres: 0.4 }, preprocess: { contrast: 1.34, backgroundTolerance: 34, invert: true } },
  internal5: { tracer: { layering: 1, linefilter: false, rightangleenhance: true, pathomit: 0, ltres: 0.2, qtres: 0.2 }, preprocess: { contrast: 1.52, backgroundTolerance: 39, invert: true } },
  smooth1: { tracer: { blurradius: 2, blurdelta: 32, rightangleenhance: false, linefilter: true, pathomit: 13, ltres: 1.25, qtres: 1.25 }, preprocess: { contrast: 1.04, backgroundTolerance: 27 } },
  smooth2: { tracer: { blurradius: 5, blurdelta: 64, rightangleenhance: false, linefilter: true, pathomit: 20, ltres: 1.8, qtres: 1.8 }, preprocess: { contrast: 0.96, backgroundTolerance: 34 } },
  clean1: { tracer: { blurradius: 1, blurdelta: 24, rightangleenhance: true, pathomit: 22, ltres: 1.3, qtres: 1.3 }, preprocess: { contrast: 1.42, backgroundTolerance: 38, posterize: true } },
  sharp1: { tracer: { blurradius: 0, linefilter: false, rightangleenhance: true, pathomit: 2, ltres: 0.36, qtres: 0.04 }, preprocess: { contrast: 1.58, backgroundTolerance: 27 } },
  detail1: { tracer: { blurradius: 0, linefilter: false, rightangleenhance: true, pathomit: 0, ltres: 0.12, qtres: 0.12 }, preprocess: { contrast: 1.16, backgroundTolerance: 20 } },
  artistic1: { tracer: { colorsampling: 0, colorquantcycles: 1, pathomit: 0, blurradius: 5, blurdelta: 64, ltres: 0.02, qtres: 0.9, linefilter: true, rightangleenhance: false, strokewidth: 1 }, preprocess: { contrast: 1.12, backgroundTolerance: 31 } },
  artistic2: { tracer: { colorsampling: 0, colorquantcycles: 1, pathomit: 1, blurradius: 1, qtres: 0.02, ltres: 0.7, linefilter: false, rightangleenhance: false, strokewidth: 0 }, preprocess: { contrast: 1.32, backgroundTolerance: 25, posterize: true } },
};

export const SVG_FILTERS = [
  { id: "edge1", label: "Edge 1" }, { id: "edge2", label: "Edge 2" }, { id: "edge3", label: "Edge 3" },
  { id: "edge4", label: "Edge 4" }, { id: "edge5", label: "Edge 5" }, { id: "edge6", label: "Edge 6" },
  { id: "internal1", label: "Internal 1" }, { id: "internal2", label: "Internal 2" }, { id: "internal3", label: "Internal 3" },
  { id: "internal4", label: "Internal 4" }, { id: "internal5", label: "Internal 5" },
  { id: "smooth1", label: "Smooth 1" }, { id: "smooth2", label: "Smooth 2" },
  { id: "clean1", label: "Clean 1" }, { id: "sharp1", label: "Sharp 1" }, { id: "detail1", label: "Detail 1" },
  { id: "artistic1", label: "Artistic 1" }, { id: "artistic2", label: "Artistic 2" },
];

function abortError() {
  return new DOMException("Conversion cancelled", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function legacyQuality(settings) {
  if (QUALITY_BY_ID[settings.svgQuality]) return settings.svgQuality;
  if (settings.svgResolution === "original" || settings.svgDetail === "maximum") return "max";
  if (Number(settings.svgResolution) > 0 && Number(settings.svgResolution) <= 900) return "fast";
  return "fine";
}

function traceDimensions(sourceWidth, sourceHeight, resolution) {
  const edgeLimit = resolution === "original" ? MAX_TRACE_EDGE : Math.min(Number(resolution) || 1600, MAX_TRACE_EDGE);
  const edgeScale = edgeLimit / Math.max(sourceWidth, sourceHeight);
  const pixelScale = Math.sqrt(MAX_TRACE_PIXELS / Math.max(1, sourceWidth * sourceHeight));
  const scale = Math.min(1, edgeScale, pixelScale);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function resolveSvgTracePlan(settings = {}, sourceWidth = 1, sourceHeight = 1) {
  const quality = QUALITY_BY_ID[legacyQuality(settings)] || QUALITY_BY_ID.fine;
  const filter = FILTER_OPTIONS[settings.svgFilter] || FILTER_OPTIONS.edge2;
  const resolution = settings.svgPreview ? quality.previewResolution : quality.resolution;
  const colors = clamp(Number(settings.svgColors) || 2, 2, 16);
  const dimensions = traceDimensions(sourceWidth, sourceHeight, resolution);
  const detail = DETAIL_OPTIONS[quality.detail];
  const fittedGeometry = {
    ltres: (filter.tracer.ltres ?? DETAIL_OPTIONS.balanced.ltres) * (detail.ltres / DETAIL_OPTIONS.balanced.ltres),
    qtres: (filter.tracer.qtres ?? DETAIL_OPTIONS.balanced.qtres) * (detail.qtres / DETAIL_OPTIONS.balanced.qtres),
    pathomit: Math.round((filter.tracer.pathomit ?? DETAIL_OPTIONS.balanced.pathomit) * (detail.pathomit / DETAIL_OPTIONS.balanced.pathomit)),
    roundcoords: detail.roundcoords,
  };
  const options = {
    colorsampling: 2,
    colorquantcycles: quality.colorquantcycles,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    rightangleenhance: true,
    pathomit: 8,
    scale: 1,
    viewbox: true,
    desc: false,
    ...detail,
    ...filter.tracer,
    // Quality scales the chosen filter instead of being overwritten by it.
    // Smooth 2 therefore remains smoother than Smooth 1 at every quality,
    // while Max still fits substantially more detail than Fast.
    ...fittedGeometry,
    // The color selector is authoritative. Filters may change geometry and
    // sampling, but never silently add colors the user did not choose.
    numberofcolors: colors,
  };
  return { quality, filter, colors, ...dimensions, options };
}

async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("This image could not be decoded for SVG tracing"));
      };
      image.src = url;
    });
  }
}

function borderBackground(pixels, width, height) {
  const buckets = new Map();
  const add = (x, y) => {
    const offset = (y * width + x) * 4;
    if (pixels[offset + 3] < 16) return;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += red;
    bucket.g += green;
    bucket.b += blue;
    buckets.set(key, bucket);
  };
  const step = Math.max(1, Math.floor(Math.max(width, height) / 160));
  for (let x = 0; x < width; x += step) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    add(0, y);
    add(width - 1, y);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return { r: 255, g: 255, b: 255 };
  return { r: dominant.r / dominant.count, g: dominant.g / dominant.count, b: dominant.b / dominant.count };
}

function preprocess(imageData, plan, settings) {
  const pixels = imageData.data;
  const background = borderBackground(pixels, imageData.width, imageData.height);
  const threshold = clamp(Number(settings.svgThreshold) || 242, 1, 254);
  const backgroundLuminance = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722;
  const tolerance = plan.filter.preprocess.backgroundTolerance;
  const contrast = plan.filter.preprocess.contrast;
  const shouldInvert = Boolean(settings.svgInvert) !== Boolean(plan.filter.preprocess.invert);
  const posterize = Boolean(plan.filter.preprocess.posterize);
  const monochrome = settings.svgMonochrome !== false;

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const backgroundDistance = Math.hypot(red - background.r, green - background.g, blue - background.b);
    const lightBackdrop = backgroundLuminance >= threshold - 20;
    const matchesBackground = backgroundDistance <= tolerance || (lightBackdrop && luminance >= threshold && backgroundDistance <= tolerance * 2.25);

    if (alpha === 0 || (settings.svgTransparent !== false && matchesBackground)) {
      pixels[index] = 0;
      pixels[index + 1] = 0;
      pixels[index + 2] = 0;
      pixels[index + 3] = 0;
      continue;
    }

    let nextRed = clamp((red - 128) * contrast + 128, 0, 255);
    let nextGreen = clamp((green - 128) * contrast + 128, 0, 255);
    let nextBlue = clamp((blue - 128) * contrast + 128, 0, 255);

    if (posterize) {
      if (monochrome) {
        const level = luminance >= threshold / 2 ? 255 : 0;
        nextRed = level;
        nextGreen = level;
        nextBlue = level;
      } else {
        nextRed = Math.round(nextRed / 64) * 64;
        nextGreen = Math.round(nextGreen / 64) * 64;
        nextBlue = Math.round(nextBlue / 64) * 64;
      }
    }

    if (monochrome) {
      const gray = nextRed * 0.2126 + nextGreen * 0.7152 + nextBlue * 0.0722;
      nextRed = gray;
      nextGreen = gray;
      nextBlue = gray;
    }
    if (shouldInvert) {
      nextRed = 255 - nextRed;
      nextGreen = 255 - nextGreen;
      nextBlue = 255 - nextBlue;
    }
    pixels[index] = nextRed;
    pixels[index + 1] = nextGreen;
    pixels[index + 2] = nextBlue;
  }
}

function recolorMonochrome(svg, color) {
  return svg
    .replace(/fill="rgb\([^\"]+\)"/g, `fill="${color}"`)
    .replace(/stroke="rgb\([^\"]+\)"/g, `stroke="${color}"`);
}

function outputName(file) {
  const base = file.name.replace(/\.[^.]+$/, "") || "vector";
  return `${base}.svg`;
}

export async function traceImageToSvg(file, settings = {}) {
  const { signal, onStatus, onProgress } = settings;
  throwIfAborted(signal);
  onStatus?.("Reading image…");
  onProgress?.(0.08);
  const source = await decode(file);
  throwIfAborted(signal);

  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const plan = resolveSvgTracePlan(settings, sourceWidth, sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("SVG tracing is not supported in this browser");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, plan.width, plan.height);
  if (typeof source.close === "function") source.close();
  const imageData = context.getImageData(0, 0, plan.width, plan.height);

  throwIfAborted(signal);
  const filterLabel = SVG_FILTERS.find(({ id }) => id === settings.svgFilter)?.label || "Edge 2";
  onStatus?.(`Applying ${filterLabel}…`);
  onProgress?.(0.24);
  preprocess(imageData, plan, settings);

  throwIfAborted(signal);
  onStatus?.(`Tracing ${plan.colors}-color paths…`);
  onProgress?.(0.42);
  let svg = ImageTracer.imagedataToSVG(imageData, plan.options);
  if (settings.svgMonochrome !== false) svg = recolorMonochrome(svg, settings.svgColor || "#111111");
  svg = svg
    .replace(/\sdesc="[^"]*"/, "")
    .replace("<svg ", `<svg role="img" aria-label="Vectorized ${file.name.replace(/[\"<>]/g, "")}" `);
  throwIfAborted(signal);
  onProgress?.(1);
  onStatus?.("");
  return {
    blob: new Blob([svg], { type: "image/svg+xml" }),
    name: outputName(file),
    svg,
    width: plan.width,
    height: plan.height,
    quality: plan.quality.id,
  };
}
