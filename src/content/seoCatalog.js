export const SITE_URL = "https://filzy.site";
export const SITE_NAME = "Filzy";
export const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/branding/og-image.png`;
export const PUBLISHED_DATE = "2026-07-15";

const label = (value) => value.toUpperCase();

const imagePairs = [
  ["png", "svg", "Trace a PNG into an editable vector with detail, smoothing, color, transparency, inversion, and path-quality controls."],
  ["jpg", "svg", "Turn a JPG into scalable SVG paths with a live original-versus-vector preview and adjustable tracing controls."],
  ["webp", "svg", "Vectorize a WEBP image into SVG while tuning colors, edges, smoothing, and transparent areas."],
  ["bmp", "svg", "Convert bitmap artwork into resolution-independent SVG paths directly in the browser."],
  ["svg", "png", "Render an SVG as a crisp PNG for apps, social posts, documents, and software that needs raster images."],
  ["svg", "jpg", "Render vector artwork as a broadly compatible JPG with output-quality controls."],
  ["svg", "webp", "Turn SVG artwork into a compact WEBP image for modern websites and apps."],
  ["png", "jpg", "Convert transparent or lossless PNG images into smaller, widely compatible JPG files."],
  ["jpg", "png", "Convert a JPG into PNG when you need lossless re-encoding or a PNG-based workflow."],
  ["png", "webp", "Reduce web image weight by converting PNG files to modern WEBP images."],
  ["jpg", "webp", "Convert JPG photos to compact WEBP images with adjustable quality and dimensions."],
  ["webp", "png", "Turn WEBP images into broadly supported PNG files without uploading them to Filzy."],
  ["webp", "jpg", "Convert WEBP images to JPG for software and services that do not accept WEBP."],
  ["png", "avif", "Create compact AVIF images from PNG sources in browsers that support AVIF encoding."],
  ["avif", "png", "Convert AVIF images to PNG for editing, sharing, and wider compatibility."],
  ["gif", "mp4", "Turn an animated GIF into a video file that is usually smaller and easier to share."],
];

const mediaPairs = [
  ["mov", "mp4", "Repackage or convert a QuickTime MOV video into the widely supported MP4 format."],
  ["mkv", "mp4", "Convert Matroska video into MP4 for browsers, phones, editors, and sharing platforms."],
  ["avi", "mp4", "Modernize an AVI video as MP4 with local browser-based media processing."],
  ["mp4", "webm", "Convert an MP4 video to WEBM for modern web playback and open media workflows."],
  ["webm", "mp4", "Convert WEBM video into a broadly compatible MP4 file."],
  ["mp4", "mp3", "Extract the audio track from an MP4 video and encode it as MP3."],
  ["mov", "mp3", "Extract audio from a MOV video and save it as an MP3 file."],
  ["mp3", "wav", "Decode MP3 audio into uncompressed WAV for editing and production workflows."],
  ["wav", "mp3", "Encode large WAV audio as a smaller MP3 with selectable bitrate and channel settings."],
  ["flac", "mp3", "Create a compatible MP3 copy from lossless FLAC audio with adjustable bitrate."],
  ["m4a", "mp3", "Convert M4A audio to MP3 for players and workflows that need universal compatibility."],
  ["ogg", "mp3", "Convert OGG audio into a widely supported MP3 file."],
];

const dataPairs = [
  ["csv", "json", "Turn rows and columns from a CSV file into structured JSON data."],
  ["json", "csv", "Flatten compatible JSON records into a CSV table for spreadsheets and data tools."],
  ["json", "yaml", "Convert JSON configuration or data into readable YAML."],
  ["yaml", "json", "Convert YAML into strict JSON for APIs, tooling, and validation."],
  ["xml", "json", "Transform XML data into JSON for modern application workflows."],
  ["srt", "vtt", "Convert SubRip captions into WebVTT for browsers and HTML video."],
  ["vtt", "srt", "Convert WebVTT captions into the commonly supported SRT subtitle format."],
];

function conversionPage([from, to, summary]) {
  const source = label(from);
  const target = label(to);
  const vector = to === "svg";
  return {
    path: `/convert/${from}-to-${to}`,
    type: "tool",
    tool: "convert",
    title: `${source} to ${target} Converter – Free & Private`,
    heading: `Free ${source} to ${target} converter`,
    eyebrow: "File converter",
    description: `${summary} Use Filzy free online with no account.`,
    intro: summary,
    highlights: vector
      ? ["Live vector preview", "Adjust detail and smoothing", "Control colors and transparency", "Runs in your browser"]
      : ["No account required", "Batch conversion", "Format-specific controls", "Processed on your device"],
    steps: [
      `Choose or drop your ${source} file${from === "jpg" ? "s" : ""}.`,
      `Review the ${target} output and adjust the available settings.`,
      `Convert, then download one file or all results together.`,
    ],
    sections: [
      {
        heading: `Why convert ${source} to ${target}?`,
        body: summary,
      },
      {
        heading: "Private browser processing",
        body: "Filzy performs this conversion on your device. Your input is not uploaded to Filzy storage, and you can process multiple compatible files in one run.",
      },
    ],
    relatedPaths: ["/convert", "/blog/local-vs-cloud-file-converters", vector ? "/blog/png-to-svg-quality-guide" : "/blog/file-format-guide"],
    dateModified: PUBLISHED_DATE,
  };
}

export const conversionPages = [...imagePairs, ...mediaPairs, ...dataPairs].map(conversionPage);

const compressionSpecs = [
  ["video-to-25mb", "video", 25, null, "Compress Video to 25 MB Online", "Set a 25 MB target and let Filzy choose a high-quality video compression plan, then fine-tune resolution, FPS, bitrate, and audio."],
  ["video-to-10mb", "video", 10, null, "Compress Video to 10 MB Online", "Reduce a video toward 10 MB with smart bitrate, resolution, frame-rate, and audio decisions."],
  ["video-to-8mb", "video", 8, null, "Compress Video to 8 MB Online", "Target an 8 MB video while preserving the best practical quality for its duration."],
  ["video-to-50mb", "video", 50, null, "Compress Video to 50 MB Online", "Compress a large video to about 50 MB with a quality-first local workflow."],
  ["video-by-50-percent", "video", null, 50, "Compress Video by 50 Percent", "Aim for half of the original video size, then adjust advanced settings if you need a different quality-size balance."],
  ["image-to-1mb", "image", 1, null, "Compress Image to 1 MB Online", "Reduce an image toward 1 MB with smart dimensions, format, and quality settings."],
  ["image-to-500kb", "image", 0.5, null, "Compress Image to 500 KB Online", "Compress an image toward 500 KB without uploading it to a server."],
  ["image-by-50-percent", "image", null, 50, "Compress Image by 50 Percent", "Aim for a 50 percent smaller image with local format, quality, and dimension controls."],
  ["audio-to-10mb", "audio", 10, null, "Compress Audio to 10 MB Online", "Reduce audio toward 10 MB with smart bitrate, sample-rate, channel, and output-format controls."],
  ["audio-by-50-percent", "audio", null, 50, "Compress Audio by 50 Percent", "Aim for half the original audio size while keeping control over bitrate, sample rate, and channels."],
];

export const compressionPages = compressionSpecs.map(([slug, mediaKind, mb, percent, title, intro]) => ({
  path: `/compress/${slug}`,
  type: "tool",
  tool: "compress",
  mediaKind,
  targetMb: mb,
  targetPercent: percent,
  title,
  heading: title,
  eyebrow: "Media compressor",
  description: `${intro} Free, private, and processed in your browser.`,
  intro,
  highlights: ["Smart target-size planning", "Advanced quality controls", "Batch processing", "Files stay on your device"],
  steps: [
    `Add one or more ${mediaKind} files.`,
    mb ? `Keep the ${mb < 1 ? `${mb * 1000} KB` : `${mb} MB`} target or adjust the advanced controls.` : `Keep the ${percent}% target or adjust the advanced controls.`,
    "Compress and download each result or a ZIP of the full batch.",
  ],
  sections: [
    { heading: "How the size target works", body: "Filzy estimates a quality-first plan from the source duration, dimensions, and media type. If the target is aggressive, reducing resolution, frame rate, or bitrate may be necessary." },
    { heading: "Local and cancellable", body: "Compression runs on your device. Each job shows progress and can be cancelled without uploading the source file to Filzy storage." },
  ],
  relatedPaths: ["/compress", "/blog/how-target-size-video-compression-works", "/blog/reduce-video-file-size"],
  dateModified: PUBLISHED_DATE,
}));

const extractSpecs = [
  ["youtube-to-mp3", "mp3", "YouTube to MP3 Converter", "Inspect the source audio that a YouTube video actually provides, then create an MP3 at the bitrate you choose."],
  ["youtube-to-mp4", "mp4", "YouTube to MP4 Converter", "Inspect the real MP4 qualities available for a YouTube video and choose the best original stream instead of a fake upscale."],
  ["youtube-to-m4a", "m4a", "YouTube to M4A Converter", "Save compatible original AAC/M4A audio when the source provides it, without pretending a higher bitrate exists."],
  ["youtube-to-webm", "webm", "YouTube to WEBM Converter", "Choose among the real WEBM qualities available from an authorized YouTube source."],
];

export const extractionPages = extractSpecs.map(([slug, target, title, intro]) => ({
  path: `/extract/${slug}`,
  type: "tool",
  tool: "extract",
  provider: "youtube",
  target,
  title,
  heading: title,
  eyebrow: "Media extractor",
  description: `${intro} Use only media you own or have permission to download.`,
  intro,
  highlights: ["Shows only real source qualities", "Best source selected by default", "Local muxing or audio conversion", "No artificial quality claims"],
  steps: [
    "Paste the link to a video you own or are authorized to download.",
    `Review the genuine source qualities and keep ${target.toUpperCase()} selected.`,
    "Extract the authorized media and save the result.",
  ],
  sections: [
    { heading: "Source quality, not invented quality", body: "Filzy reads the formats actually exposed for the specific video. It does not label a 720p source as genuine 4K or a low-bitrate source as genuine high-bitrate audio." },
    { heading: "Rights and platform rules", body: "Only download media you created, licensed, or otherwise have permission to save. Availability can depend on the source and its access rules." },
  ],
  relatedPaths: ["/extract", target === "mp3" ? "/blog/youtube-to-mp3-bitrate-guide" : "/blog/youtube-source-quality-explained", "/blog/mp4-vs-webm"],
  dateModified: PUBLISHED_DATE,
}));

const sendSpecs = [
  ["large-files", "Send Large Files Free", "Send large files directly between devices without first storing the file on Filzy."],
  ["between-devices", "Send Files Between Devices", "Open a Filzy Beam on one device, scan or share its link, and transfer files directly to the receiving device."],
  ["large-videos", "Send Large Videos Free", "Transfer large video files directly between connected devices without a Filzy upload limit."],
  ["free-file-transfer", "Free File Transfer with Filzy Beam", "Share files through a live browser-to-browser Beam without creating an account."],
];

export const sendPages = sendSpecs.map(([slug, title, intro]) => ({
  path: `/send/${slug}`,
  type: "tool",
  tool: "send",
  title,
  heading: title,
  eyebrow: "Filzy Beam",
  description: `${intro} The sender stays open while the receiver downloads.`,
  intro,
  highlights: ["No Filzy file storage", "Files and folders", "Share by link or QR code", "No account required"],
  steps: [
    "Add files or folders to a new Beam.",
    "Start the Beam and share its link or QR code.",
    "Keep the sender open while the receiver saves the files.",
  ],
  sections: [
    { heading: "What ‘no Filzy upload limit’ means", body: "Beam does not upload a copy to Filzy storage first. Practical transfer size still depends on browser, device memory, network stability, and keeping the sending tab available." },
    { heading: "Designed for direct handoff", body: "Beam is useful when two devices can be online at the same time. It favors an immediate transfer rather than a long-lived cloud-hosted download link." },
  ],
  relatedPaths: ["/", "/blog/how-to-send-large-files", "/blog/peer-to-peer-file-transfer-privacy"],
  dateModified: PUBLISHED_DATE,
}));

export const basePages = [
  {
    path: "/",
    type: "tool",
    tool: "send",
    title: "Send Large Files Free with Beam",
    heading: "Send files directly between devices",
    eyebrow: "Filzy Beam",
    description: "Send large files and folders directly between devices with a live Filzy Beam. Free, no account, and no Filzy file storage.",
    intro: "Beam creates a live browser-to-browser handoff for files and folders. Share a link or QR code and keep the sender open while the receiver downloads.",
    highlights: ["No Filzy file storage", "Files and folders", "Share by link or QR", "No account"],
    steps: ["Add files or folders.", "Start the Beam and share it.", "Keep the sender open until the transfer finishes."],
    relatedPaths: ["/send/large-files", "/convert", "/compress", "/extract", "/blog"],
    dateModified: PUBLISHED_DATE,
  },
  {
    path: "/convert",
    type: "tool",
    tool: "convert",
    title: "Free Online File Converter",
    heading: "Convert files in your browser",
    eyebrow: "File converter",
    description: "Convert images, video, audio, subtitles, and structured data with batch processing and format-specific settings. No account required.",
    intro: "Choose any supported input and output, add multiple files, adjust format-specific controls, and download the results individually or as a ZIP.",
    highlights: ["Batch conversion", "Searchable format picker", "Format-specific settings", "Local processing"],
    steps: ["Choose the input and output formats.", "Add compatible files or folders.", "Convert and download the results."],
    relatedPaths: ["/convert/png-to-svg", "/convert/mov-to-mp4", "/convert/wav-to-mp3", "/blog/file-format-guide"],
    dateModified: PUBLISHED_DATE,
  },
  {
    path: "/compress",
    type: "tool",
    tool: "compress",
    title: "Compress Video, Images & Audio Online",
    heading: "Compress media to a target size",
    eyebrow: "Media compressor",
    description: "Compress video, images, and audio to a target file size with per-file controls and batch downloads.",
    intro: "Enter the size you need and let Filzy estimate a quality-first plan, or take control of resolution, FPS, bitrate, dimensions, format, audio, and channels.",
    highlights: ["Target file size", "Per-file estimates", "Detected media controls", "Local processing"],
    steps: ["Choose a target size.", "Add compatible media files.", "Fine-tune any file, then compress and download."],
    relatedPaths: ["/compress/video-to-25mb", "/compress/image-to-1mb", "/blog/how-target-size-video-compression-works"],
    dateModified: PUBLISHED_DATE,
  },
  {
    path: "/extract",
    type: "tool",
    tool: "extract",
    title: "Extract Video & Audio in Real Source Quality",
    heading: "Extract real video and audio qualities",
    eyebrow: "Media extractor",
    description: "Inspect the genuine qualities available for an authorized YouTube video, then save original video or locally converted audio.",
    intro: "Filzy shows only the formats the source actually provides, selects the best real source by default, and keeps artificial upscales separate from authentic quality.",
    highlights: ["Real source formats", "Best quality by default", "Video and audio outputs", "Local muxing and conversion"],
    steps: ["Paste an authorized YouTube link.", "Choose a real source quality and output.", "Extract and save the result."],
    relatedPaths: ["/extract/youtube-to-mp3", "/extract/youtube-to-mp4", "/blog/youtube-source-quality-explained"],
    dateModified: PUBLISHED_DATE,
  },
];

function article(slug, title, description, category, readMinutes, sections, relatedPaths) {
  return {
    path: `/blog/${slug}`,
    slug,
    type: "article",
    title,
    heading: title,
    eyebrow: category,
    description,
    intro: sections[0]?.body || description,
    readMinutes,
    sections,
    relatedPaths,
    datePublished: PUBLISHED_DATE,
    dateModified: PUBLISHED_DATE,
  };
}

export const guidePages = [
  article("png-to-svg-quality-guide", "How to Convert PNG to SVG Without Losing the Logo", "A practical guide to tracing PNG logos into clean SVG paths with better colors, edges, transparency, and fewer unnecessary nodes.", "Vector guide", 7, [
    { heading: "Start with the cleanest raster source", body: "Vector tracing follows the pixels it receives. A larger PNG with crisp edges, flat colors, and little compression noise gives the tracer clearer boundaries. Upscaling a tiny image before tracing can soften edges but cannot restore details that were never present." },
    { heading: "Choose detail for the artwork, not the file size", body: "Logos and icons usually benefit from fewer, cleaner paths; photographs need far more paths to resemble the source. Increase detail until important shapes appear, then stop before texture and noise become thousands of tiny vector regions." },
    { heading: "Use smoothing and color count together", body: "Smoothing reduces jagged pixel contours, while the color count controls how many visual regions are preserved. For flat branding, start with the known brand-color count. For illustrated marks, add colors gradually and compare the live preview at both normal size and a close zoom." },
    { heading: "Check transparency and inversion", body: "Transparent backgrounds prevent a white rectangle from becoming part of the vector. Inversion is useful for a light logo supplied on a dark preview, but the final path color should still be checked against the surfaces where the SVG will be used." },
    { heading: "Inspect the result as a vector", body: "A good SVG should remain sharp at any scale, have sensible negative space, and avoid isolated specks. Test it on light and dark backgrounds, then use the path-color option if the source is intended as a one-color mark." },
  ], ["/convert/png-to-svg", "/blog/raster-vs-vector", "/blog/file-format-guide"]),

  article("raster-vs-vector", "Raster vs Vector: PNG, JPG and SVG Explained", "Understand pixels, paths, transparency, scaling, and when PNG, JPG, WEBP, AVIF, or SVG is the right output.", "Format guide", 6, [
    { heading: "Raster images store pixels", body: "PNG, JPG, WEBP, and AVIF describe a grid of colored pixels. They are ideal for photographs and textured artwork, but enlarging them beyond their source resolution eventually reveals softness or pixelation." },
    { heading: "Vector images store shapes", body: "SVG describes paths, fills, strokes, gradients, and text. A clean vector logo can scale from a favicon to signage without becoming blurry, and individual shapes can be recolored or edited." },
    { heading: "Converting to SVG is tracing", body: "Saving a raster image inside an SVG wrapper does not make it a true vector. Genuine vectorization analyzes visual boundaries and creates paths. The result depends on source clarity, path detail, smoothing, and how many colors must be represented." },
    { heading: "Choose by content", body: "Use JPG for photographs when transparency is unnecessary, PNG for lossless graphics or transparency, WEBP or AVIF for efficient modern delivery, and SVG for artwork built from shapes such as logos, diagrams, and icons." },
  ], ["/convert/png-to-svg", "/convert/svg-to-png", "/blog/png-to-svg-quality-guide"]),

  article("file-format-guide", "PNG vs JPG vs WEBP vs AVIF: Which Image Format Should You Use?", "Compare the most common web image formats by compression, transparency, compatibility, animation, and editing needs.", "Format guide", 8, [
    { heading: "PNG prioritizes fidelity", body: "PNG is lossless and supports transparency, making it dependable for interface graphics, screenshots, and artwork with crisp edges. Photo-heavy PNG files are often much larger than modern lossy alternatives." },
    { heading: "JPG remains widely compatible", body: "JPG works almost everywhere and compresses photographs efficiently. It does not support transparency, and repeated editing or aggressive quality settings can introduce visible blocks and ringing around edges." },
    { heading: "WEBP balances size and compatibility", body: "WEBP supports lossy and lossless compression, transparency, and animation. It is a practical default for modern web delivery when you want smaller files without moving to a newer format that some older tools may not accept." },
    { heading: "AVIF can be smaller at similar quality", body: "AVIF is often efficient for photographs and gradients and supports transparency. Encoding can be slower, and compatibility with older editing software can be less predictable, so keeping an editable source remains wise." },
    { heading: "There is no universal winner", body: "Choose the format from the content and destination: PNG for lossless graphics, JPG for maximum photo compatibility, WEBP for a strong modern default, AVIF for aggressive delivery efficiency, and SVG for genuinely vector artwork." },
  ], ["/convert/png-to-webp", "/convert/jpg-to-webp", "/convert/png-to-avif"]),

  article("reduce-video-file-size", "How to Reduce Video File Size Without Guessing", "Learn how duration, resolution, FPS, video bitrate, audio bitrate, and codec choices determine compressed video size and quality.", "Compression guide", 8, [
    { heading: "Duration and bitrate drive file size", body: "For a given duration, the combined video and audio bitrate is the main predictor of output size. A long clip needs a lower bitrate than a short clip to reach the same megabyte target." },
    { heading: "Resolution must match the bitrate", body: "Too many pixels at too little bitrate creates smearing and block artifacts. When a target is tight, reducing 4K to 1080p or 720p can look better than keeping the original resolution at an inadequate bitrate." },
    { heading: "Frame rate is another budget", body: "Sixty frames per second contains twice as many frames as thirty. For motion-heavy footage, keep the source frame rate when the budget permits; for a small target, 30 or 24 FPS may preserve more detail per frame." },
    { heading: "Audio can be small but not free", body: "Stereo audio at 128 kbps is modest beside high-quality video, yet it matters for very small targets or long recordings. Speech can often tolerate a lower bitrate or mono output better than music." },
    { heading: "Use the estimate, then inspect", body: "A target-size planner is an estimate because codecs respond differently to motion, noise, and texture. Check the result around fast movement, gradients, text, and faces before deciding that the smallest file is good enough." },
  ], ["/compress/video-to-25mb", "/blog/how-target-size-video-compression-works", "/blog/video-bitrate-file-size"]),

  article("how-target-size-video-compression-works", "How Target-Size Video Compression Works", "See how Filzy turns a target such as 25 MB into a bitrate, resolution, FPS, and audio plan while protecting practical quality.", "Compression guide", 7, [
    { heading: "The size target becomes a bitrate budget", body: "The compressor converts megabytes into bits, reserves room for container overhead, divides by duration, and separates the result into video and audio budgets. That produces a bitrate target rather than a guarantee." },
    { heading: "Smart settings are linked", body: "Bitrate cannot be judged alone. Filzy uses the source dimensions and duration to select a practical resolution and frame rate, because a lower-resolution encode can look cleaner when the available bits are limited." },
    { heading: "Manual changes replace the target", body: "Once you adjust bitrate, resolution, FPS, format, or audio controls, the displayed size becomes an estimate of those decisions. Re-entering a target returns the linked controls to smart planning." },
    { heading: "Impossible targets need compromise", body: "A multi-hour 4K video cannot become a few megabytes while preserving original quality. The honest choices are a larger file, shorter duration, lower resolution, lower frame rate, lower audio bitrate, or visibly stronger compression." },
  ], ["/compress/video-to-25mb", "/compress/video-to-10mb", "/blog/reduce-video-file-size"]),

  article("video-bitrate-file-size", "Video Bitrate and File Size: A Practical Calculator Guide", "Understand the relationship between bitrate, duration, audio, resolution, and the final size of an encoded video.", "Compression guide", 6, [
    { heading: "The useful approximation", body: "Estimated bytes are approximately duration in seconds multiplied by total bits per second, divided by eight. Add video and audio bitrates before converting the result to megabytes, then leave a little room for container overhead." },
    { heading: "Bitrate is not a quality score", body: "Two codecs can produce different quality at the same bitrate, and easy scenes compress better than noisy or fast-moving footage. Bitrate describes data rate, not guaranteed visual fidelity." },
    { heading: "Resolution changes what the bitrate must describe", body: "A 4K frame contains four times as many pixels as 1080p. If both receive the same low bitrate, the 1080p version often looks better because each frame has fewer details competing for the available data." },
    { heading: "Use source-aware estimates", body: "Duration, frame size, FPS, audio, and the requested codec all belong in a useful estimate. The final encode is the only definitive size, so leave a small margin when a platform rejects anything above a strict limit." },
  ], ["/compress/video-to-25mb", "/blog/how-target-size-video-compression-works"]),

  article("compress-images-for-web", "How to Compress Images for the Web", "Reduce image weight with the right format, dimensions, and quality while protecting text, logos, photographs, and transparency.", "Compression guide", 7, [
    { heading: "Resize before lowering quality", body: "An image displayed at 1200 pixels wide does not need a 6000-pixel source in the delivered page. Reducing dimensions removes unnecessary pixels and often saves more than pushing quality to visibly damaging levels." },
    { heading: "Match the format to the content", body: "Photographs usually suit JPG, WEBP, or AVIF. Interface graphics with transparency can use PNG or lossless WEBP. Logos built from shapes are often better delivered as SVG rather than compressed raster images." },
    { heading: "Inspect edges and gradients", body: "Compression artifacts are easiest to see around text, sharp contrast, smooth skies, shadows, and repeated patterns. Compare at the actual display size instead of judging only a zoomed preview." },
    { heading: "Keep an original source", body: "Web outputs are delivery copies. Preserve the highest-quality editable original so future crops, sizes, and formats do not compound losses from an already compressed derivative." },
  ], ["/compress/image-to-1mb", "/compress/image-to-500kb", "/blog/file-format-guide"]),

  article("compress-audio-by-bitrate", "How to Compress Audio with Bitrate, Sample Rate, and Channels", "Choose sensible MP3, AAC, or Opus settings for music, speech, podcasts, and strict file-size targets.", "Compression guide", 7, [
    { heading: "Duration and bitrate predict size", body: "Audio size is mainly duration multiplied by bitrate. Lowering 320 kbps to 128 kbps reduces the encoded data substantially, but the audible effect depends on the codec and source material." },
    { heading: "Speech and music need different settings", body: "Clean speech often remains intelligible at lower bitrates and can sometimes use mono. Music, ambience, and stereo effects benefit from more bitrate and preserving two channels." },
    { heading: "Sample rate is not the same as bitrate", body: "Sample rate describes how often the waveform is sampled; bitrate describes how much encoded data is used per second. Lowering sample rate can reduce high-frequency bandwidth, while lowering bitrate increases compression pressure." },
    { heading: "Re-encoding never restores quality", body: "Turning a low-bitrate source into a 320 kbps MP3 creates a larger file but cannot recreate information removed earlier. Keep original audio where possible and use the source quality as the upper practical limit." },
  ], ["/compress/audio-to-10mb", "/convert/wav-to-mp3", "/blog/wav-vs-mp3"]),

  article("how-to-send-large-files", "How to Send Large Files Without Uploading Them to Cloud Storage", "Use a live browser-to-browser Beam to hand large files and folders directly from one device to another.", "Beam guide", 6, [
    { heading: "Direct transfer changes the workflow", body: "A cloud share normally uploads the complete file first, stores it, and lets the receiver download later. A live Beam connects sender and receiver at the same time, so the sender must remain available until the handoff completes." },
    { heading: "Prepare both devices", body: "Use stable networks, keep both browser tabs open, and prevent laptops or phones from sleeping. Wired or strong Wi-Fi connections improve reliability for large videos and folders." },
    { heading: "Share the Beam, not the file", body: "Add files, start the Beam, and send the short link or QR code to the intended receiver. The link identifies the live session; it is not a permanent stored copy of the file." },
    { heading: "Understand practical limits", body: "Filzy does not impose a storage upload cap on Beam, but browsers, memory, network changes, and device power still affect what can complete. Very large transfers benefit from keeping both devices close to power and on steady connections." },
  ], ["/send/large-files", "/send/between-devices", "/blog/peer-to-peer-file-transfer-privacy"]),

  article("send-files-between-devices", "How to Send Files Between a Phone and Computer", "Transfer files between devices with a QR code, a live browser session, and no Filzy account.", "Beam guide", 5, [
    { heading: "Start on the device that has the files", body: "Open Filzy, add the files or folders, and start a Beam. The sending tab becomes the source, so leave it open until every requested download has finished." },
    { heading: "Use the QR code for the second device", body: "Scanning avoids typing a link and is especially convenient between a computer and phone. Confirm that the receiving browser shows the expected file list before saving anything." },
    { heading: "Keep the connection stable", body: "Switching networks, locking a phone, or suspending a laptop can interrupt a live transfer. Keep the browser foregrounded when possible and retry from a stable connection if the devices disconnect." },
    { heading: "Use cloud storage when the receiver is offline", body: "Beam is designed for simultaneous handoff. If the receiver must download hours or days later, a storage-based service is the more appropriate architecture." },
  ], ["/send/between-devices", "/", "/blog/how-to-send-large-files"]),

  article("peer-to-peer-file-transfer-privacy", "Peer-to-Peer File Transfer Privacy: What It Does and Does Not Mean", "A clear explanation of direct browser file transfer, signaling, encryption in transit, metadata, and practical privacy limits.", "Privacy guide", 8, [
    { heading: "Direct does not mean invisible", body: "A peer connection avoids placing the file in Filzy storage, but the devices still use networks and coordination services to establish a session. Connection metadata can exist even when the file content is not stored by Filzy." },
    { heading: "Transport encryption protects the connection", body: "Modern WebRTC data channels use encrypted transport. That protects data in transit between endpoints, but it does not protect a file after the receiver saves it or if either device is compromised." },
    { heading: "The receiver must be trusted", body: "Anyone who can access a valid live session may be able to request the offered files. Share Beam links through an appropriate channel and stop the session when the intended handoff is complete." },
    { heading: "Architecture should match the job", body: "Direct transfer is useful for immediate device-to-device handoff. End-to-end encrypted storage, expiring cloud links, and offline delivery solve different problems and should not be presented as identical." },
  ], ["/send/free-file-transfer", "/blog/how-to-send-large-files", "/blog/local-vs-cloud-file-converters"]),

  article("youtube-source-quality-explained", "YouTube Download Quality: Source Resolution, FPS, Codec, and Audio", "Learn why available YouTube formats differ by video and why upscaling or higher output bitrate does not create genuine source quality.", "Extractor guide", 8, [
    { heading: "Each video exposes its own format set", body: "Resolution, frame rate, video codec, audio codec, and container depend on the uploaded source and the platform's encodes. A selector should show formats returned for that video rather than a universal list of 4K or 60 FPS options." },
    { heading: "Video and audio can be separate", body: "Higher-quality playback often combines a video-only stream with a separate audio stream. Joining compatible streams in a container is muxing; it does not need to re-encode either track and therefore does not reduce their source quality." },
    { heading: "Upscaling is not restoration", body: "Encoding 720p as 4K creates more pixels but not more captured detail. Similarly, encoding low-bitrate audio as 320 kbps creates a larger derivative, not higher-quality source audio." },
    { heading: "Choose compatibility or efficiency", body: "H.264 in MP4 is broadly compatible. VP9 or AV1 can be more efficient but may require WEBM or newer playback support. The best choice depends on whether the file is for editing, archiving, sharing, or a particular device." },
    { heading: "Download only authorized media", body: "Source availability does not grant copyright permission. Save media only when you created it, have a license, or the rights holder and platform rules permit the download." },
  ], ["/extract/youtube-to-mp4", "/extract/youtube-to-webm", "/blog/youtube-to-mp3-bitrate-guide"]),

  article("youtube-to-mp3-bitrate-guide", "YouTube to MP3 Bitrate: 128, 192, 256, or 320 kbps?", "Choose an MP3 bitrate from the real source audio quality instead of making a larger file that cannot improve the source.", "Extractor guide", 7, [
    { heading: "Start with the source audio", body: "The platform may provide AAC or Opus at a bitrate below the MP3 setting you choose. A 320 kbps MP3 made from a lower-bitrate source cannot restore information removed by the original encoding." },
    { heading: "128 kbps favors size", body: "For speech, casual listening, and tight storage limits, 128 kbps MP3 can be practical. Dense music, sharp transients, and complex ambience make compression artifacts more noticeable." },
    { heading: "192 or 256 kbps is a balanced range", body: "These settings offer more headroom for music without the size of 320 kbps. Whether the difference is audible depends on the source, encoder, listening equipment, and listener." },
    { heading: "320 kbps is an output choice, not a source claim", body: "Use it when downstream requirements call for high-bitrate MP3 or you prefer the encoding margin, but understand that it only preserves what exists in the decoded source." },
    { heading: "Respect rights and platform terms", body: "Convert only media you own or are authorized to save. A technical conversion path does not override copyright or a platform's access rules." },
  ], ["/extract/youtube-to-mp3", "/blog/youtube-source-quality-explained", "/blog/compress-audio-by-bitrate"]),

  article("youtube-to-mp4-quality-guide", "YouTube to MP4: How to Keep the Best Real Quality", "Choose genuine source resolution, FPS, codec, audio, and muxing options when saving an authorized YouTube video as MP4.", "Extractor guide", 7, [
    { heading: "Read the available formats first", body: "A quality selector should be derived from the chosen video's returned formats. If the best MP4 source is 1080p at 30 FPS, the interface should say that clearly rather than offering a fabricated 4K label." },
    { heading: "Prefer original streams when compatible", body: "Saving an existing video and audio stream avoids generational loss. When tracks are separate, local muxing can place them into a final container without changing the encoded media." },
    { heading: "Check codec compatibility", body: "MP4 commonly contains H.264 video and AAC audio, but container and codec are separate concepts. A device or editor may accept the MP4 container while rejecting a newer codec inside it." },
    { heading: "Estimate size from the selected streams", body: "When content-length information exists, the combined stream sizes provide a useful estimate. Otherwise duration and bitrate offer an approximation, and the final download remains the definitive answer." },
  ], ["/extract/youtube-to-mp4", "/blog/youtube-source-quality-explained", "/blog/mp4-vs-webm"]),

  article("mp4-vs-webm", "MP4 vs WEBM: Compatibility, Codecs, and File Size", "Compare MP4 and WEBM containers for browser playback, editing, downloads, H.264, VP9, AV1, AAC, and Opus.", "Format guide", 6, [
    { heading: "A container is not a codec", body: "MP4 and WEBM organize media tracks and metadata. The compression comes from codecs such as H.264, VP9, AV1, AAC, or Opus, so two files with different containers can have very different performance and compatibility." },
    { heading: "MP4 is the compatibility default", body: "MP4 with H.264 video and AAC audio is accepted by a broad range of phones, editors, browsers, and sharing tools. It is the safer choice when the destination is unknown." },
    { heading: "WEBM fits modern web media", body: "WEBM commonly carries VP9 or AV1 video and Opus audio. It can offer efficient web delivery and open-format workflows, though some editing applications and older devices are less comfortable with it." },
    { heading: "Remux when possible, convert when necessary", body: "Changing containers without re-encoding is fast and lossless only when the target container accepts the existing codecs. Otherwise the media tracks must be encoded into compatible codecs." },
  ], ["/convert/mp4-to-webm", "/convert/webm-to-mp4", "/extract/youtube-to-mp4"]),

  article("wav-vs-mp3", "WAV vs MP3: Editing Quality, Compatibility, and Size", "Understand uncompressed WAV and lossy MP3 audio, when conversion helps, and why a higher output bitrate cannot restore a compressed source.", "Format guide", 6, [
    { heading: "WAV is commonly uncompressed", body: "PCM WAV stores waveform samples directly and is useful for editing, interchange, and production. Its predictable quality comes with much larger files than perceptual audio codecs." },
    { heading: "MP3 removes information to save space", body: "MP3 uses lossy compression designed around human hearing. A sensible bitrate can sound good while reducing size dramatically, but repeated lossy encodes accumulate damage." },
    { heading: "MP3 to WAV does not restore detail", body: "Decoding an MP3 into WAV makes an uncompressed representation of the already compressed signal. It can help a tool that requires WAV, but it cannot reconstruct frequencies or transients discarded by MP3 encoding." },
    { heading: "Keep masters, create delivery copies", body: "Preserve WAV, FLAC, or the best available original for future editing. Create MP3 copies for distribution, compatibility, or strict size requirements." },
  ], ["/convert/wav-to-mp3", "/convert/mp3-to-wav", "/blog/compress-audio-by-bitrate"]),

  article("json-csv-conversion", "JSON to CSV and CSV to JSON: What Converts Cleanly?", "Learn how records, headers, nested objects, arrays, types, quoting, and encodings affect JSON and CSV conversion.", "Data guide", 7, [
    { heading: "CSV is a table", body: "CSV represents rows and columns. Headers name fields, delimiters separate values, and quoting protects commas or line breaks inside a cell. It does not natively express nested objects or arrays." },
    { heading: "JSON can express hierarchy", body: "JSON records can contain objects, arrays, numbers, booleans, nulls, and strings. A flat array of similarly shaped objects maps cleanly to CSV; deeply nested data needs a flattening rule or must remain JSON." },
    { heading: "Types need care", body: "CSV cells are text, so values such as leading-zero identifiers, dates, large numbers, and booleans can be reinterpreted by spreadsheet software. Validate important columns after conversion." },
    { heading: "Round trips are not always lossless", body: "JSON to CSV to JSON may not recreate the original hierarchy or types. Use CSV for tabular exchange and JSON when structure and data types matter." },
  ], ["/convert/json-to-csv", "/convert/csv-to-json", "/blog/local-vs-cloud-file-converters"]),

  article("subtitle-srt-vtt", "SRT vs WebVTT: Converting Subtitles for Video", "Compare SRT and WebVTT timing, cue settings, styling, browser support, and what to check after subtitle conversion.", "Subtitle guide", 6, [
    { heading: "SRT is simple and widely recognized", body: "SubRip uses numbered cues, time ranges, and text. Its simplicity makes it compatible with many players and editors, but formal styling and positioning capabilities are limited." },
    { heading: "WebVTT is designed for web media", body: "WebVTT works with HTML video and supports cue settings, notes, and richer positioning. Its timestamps use periods for milliseconds, while SRT commonly uses commas." },
    { heading: "Conversion should preserve timing and text", body: "A careful converter rewrites the syntax while keeping cue order, start and end times, and line breaks. Styling that exists only in one format may require simplification." },
    { heading: "Always spot-check playback", body: "Check the first cue, overlapping cues, long lines, non-ASCII characters, and the final cue. A syntactically valid file can still be uncomfortable to read if line length or timing is poor." },
  ], ["/convert/srt-to-vtt", "/convert/vtt-to-srt", "/convert"]),

  article("local-vs-cloud-file-converters", "Local vs Cloud File Converters: Privacy, Speed, and Capability", "Compare browser-side conversion with server conversion without pretending one architecture is best for every format or device.", "Privacy guide", 7, [
    { heading: "Local conversion keeps the source on the device", body: "Browser-side tools can process compatible files without uploading them to the converter's storage. This can improve privacy and avoid an upload-download round trip, especially on fast modern devices." },
    { heading: "Cloud conversion has broader engines", body: "Servers can run native applications, licensed codecs, fonts, and high-memory workloads that browsers may not support. They can also continue after a user closes the tab, though the source must be uploaded and governed by the service's retention policy." },
    { heading: "Device resources matter locally", body: "Large videos can consume substantial memory, CPU, battery, and time. Browser limits differ by device, so local processing is not automatically faster or more reliable for every workload." },
    { heading: "Choose from the file and risk", body: "Use local conversion when the format is supported and avoiding upload matters. Use a reputable cloud service when a specialized engine is required, after checking encryption, retention, deletion, region, and access controls." },
  ], ["/convert", "/compress", "/blog/file-conversion-privacy-checklist"]),

  article("file-conversion-privacy-checklist", "File Conversion Privacy Checklist", "Questions to ask before converting confidential images, documents, audio, or video with a browser or cloud service.", "Privacy guide", 6, [
    { heading: "Does the file leave the device?", body: "Look for a clear architecture statement, not only a lock icon. HTTPS protects an upload in transit; it does not mean the server never receives, stores, scans, or logs the file." },
    { heading: "What is retained and for how long?", body: "For cloud conversion, check file deletion windows, backup retention, generated preview storage, logs, analytics, and whether manual deletion is available." },
    { heading: "What code or engine processes the file?", body: "Local tools may download a conversion engine into the browser. Cloud tools may invoke third-party providers. Knowing the processing chain helps assess confidentiality, licensing, and regional requirements." },
    { heading: "Can the result leak information?", body: "Converted files can retain metadata, comments, embedded thumbnails, subtitles, or filenames. Inspect outputs before sharing sensitive material, regardless of where the conversion ran." },
  ], ["/convert", "/blog/local-vs-cloud-file-converters", "/blog/peer-to-peer-file-transfer-privacy"]),
];

export const blogIndexPage = {
  path: "/blog",
  type: "collection",
  title: "File Conversion, Compression & Transfer Guides",
  heading: "Filzy guides",
  eyebrow: "Learn",
  description: "Practical guides to file formats, private conversion, media compression, vector tracing, direct transfer, and real source quality.",
  intro: "Understand what a format or setting actually changes before you convert, compress, extract, or send a file.",
  relatedPaths: guidePages.map((page) => page.path),
  dateModified: PUBLISHED_DATE,
};

export const allSeoPages = [
  ...basePages,
  ...sendPages,
  ...conversionPages,
  ...compressionPages,
  ...extractionPages,
  blogIndexPage,
  ...guidePages,
];

const byPath = new Map(allSeoPages.map((page) => [page.path, page]));

export function normalizeSeoPath(pathname = "/") {
  const path = pathname.split(/[?#]/)[0] || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

export function seoPageForPath(pathname) {
  return byPath.get(normalizeSeoPath(pathname)) || null;
}

export function relatedPagesFor(page) {
  return (page?.relatedPaths || []).map((path) => byPath.get(path)).filter(Boolean);
}

export const indexablePaths = allSeoPages.map((page) => page.path);
