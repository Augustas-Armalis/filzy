// Generates real, downloadable placeholder files for the recipient preview.
// Images are drawn on a canvas (so they're genuine PNG bytes); plus one text file.

function imageFile(w, h, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, w, h);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A soft highlight so thumbnails read as distinct "photos".
  const r = ctx.createRadialGradient(w * 0.32, h * 0.3, 0, w * 0.32, h * 0.3, w * 0.6);
  r.addColorStop(0, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, url: dataUrl };
}

let pid = 0;

export function makeReceiveFiles() {
  const a = imageFile(720, 480, [[0, "#8fb3d6"], [1, "#37536e"]]);
  const b = imageFile(720, 480, [[0, "#f0c08a"], [1, "#b5623a"]]);
  const c = imageFile(720, 480, [[0, "#9fc79a"], [1, "#3c6b4d"]]);
  const note = new TextEncoder().encode(
    "Thanks for using Filzy!\n\nThese are placeholder files generated in your browser, " +
      "so you can test that downloading works end to end.\n",
  );

  return [
    { id: ++pid, kind: "image", name: "sunset_lake.png", mime: "image/png", bytes: a.bytes, url: a.url, size: a.bytes.length },
    { id: ++pid, kind: "image", name: "old_town.png", mime: "image/png", bytes: b.bytes, url: b.url, size: b.bytes.length },
    { id: ++pid, kind: "image", name: "pine_forest.png", mime: "image/png", bytes: c.bytes, url: c.url, size: c.bytes.length },
    { id: ++pid, kind: "text", name: "read_me.txt", mime: "text/plain", bytes: note, url: null, size: note.length },
  ];
}
