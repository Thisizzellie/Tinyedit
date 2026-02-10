"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";

type Preset = { key: string; label: string; w: number; h: number; group: string };

const PRESETS: Preset[] = [
  // Apple iPhone
  { key: "ios_iphone_69", label: "iPhone 6.9\" Portrait 1290×2796", w: 1290, h: 2796, group: "Apple iPhone" },
  { key: "ios_iphone_65", label: "iPhone 6.5\" Portrait 1284×2778", w: 1284, h: 2778, group: "Apple iPhone" },
  { key: "ios_iphone_63", label: "iPhone 6.3\" Portrait 1179×2556", w: 1179, h: 2556, group: "Apple iPhone" },

  // Apple iPad
  { key: "ios_ipad_13", label: "iPad 13\" Portrait 2064×2752", w: 2064, h: 2752, group: "Apple iPad" },
  { key: "ios_ipad_11", label: "iPad 11\" Portrait 1668×2388", w: 1668, h: 2388, group: "Apple iPad" },
  { key: "ios_ipad_105", label: "iPad 10.5\" Portrait 1668×2224", w: 1668, h: 2224, group: "Apple iPad" },
  { key: "ios_ipad_97", label: "iPad 9.7\" Portrait 1536×2048", w: 1536, h: 2048, group: "Apple iPad" },

  // Google Play
  { key: "android_9_16", label: "Android Portrait 1080×1920", w: 1080, h: 1920, group: "Google Play" },
  { key: "android_16_9", label: "Android Landscape 1920×1080", w: 1920, h: 1080, group: "Google Play" },
  { key: "android_tall", label: "Android Tall 1080×2340", w: 1080, h: 2340, group: "Google Play" },
  { key: "android_tab_p", label: "Android Tablet Portrait 1200×1920", w: 1200, h: 1920, group: "Google Play" },
  { key: "android_tab_l", label: "Android Tablet Landscape 1920×1200", w: 1920, h: 1200, group: "Google Play" },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function makeSessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "storeshot_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
  localStorage.setItem(key, id);
  return id;
}

function track(event: string, data?: Record<string, unknown>) {
  try {
    const sid = makeSessionId();
    const payload = { event, sid, ts: Date.now(), ...data };
    // lightweight: store locally (later you can send to your backend)
    const k = "storeshot_events";
    const arr = JSON.parse(localStorage.getItem(k) || "[]");
    arr.push(payload);
    localStorage.setItem(k, JSON.stringify(arr.slice(-200)));
  } catch {
    // ignore
  }
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });
    return img;
  } finally {
    // keep URL alive until image is loaded, then release
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

type Mode = "fill" | "fit";
type OutFormat = "image/webp" | "image/jpeg" | "image/png";
type FitBackground = "transparent" | "solid" | "gradient";
type DeviceFrame = "none" | "iphone" | "ipad" | "android";

const FRAME_PADDING: Record<DeviceFrame, { top: number; right: number; bottom: number; left: number }> = {
  none: { top: 0, right: 0, bottom: 0, left: 0 },
  iphone: { top: 52, right: 40, bottom: 48, left: 40 },
  ipad: { top: 72, right: 60, bottom: 72, left: 60 },
  android: { top: 44, right: 32, bottom: 44, left: 32 },
};

async function exportProcessed(params: {
  file: File;
  targetW: number;
  targetH: number;
  mode: Mode;
  outFormat: OutFormat;
  quality: number;
  fitBackground?: FitBackground;
  fitSolidColor?: string;
  fitGradientStart?: string;
  fitGradientEnd?: string;
  deviceFrame?: DeviceFrame;
  zoom?: number;
}): Promise<Blob> {
  const {
    file,
    targetW,
    targetH,
    mode,
    outFormat,
    quality,
    fitBackground = "transparent",
    fitSolidColor = "#000000",
    fitGradientStart = "#1a1a2e",
    fitGradientEnd = "#16213e",
    deviceFrame = "none",
    zoom = 100,
  } = params;

  const zoomFactor = Math.max(0.5, Math.min(2, zoom / 100));

  const img = await loadImage(file);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas not supported");

  // High quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;

  const srcAspect = srcW / srcH;
  const dstAspect = targetW / targetH;

  let drawW = targetW;
  let drawH = targetH;

  if (mode === "fit") {
    if (fitBackground === "solid") {
      ctx.fillStyle = fitSolidColor;
      ctx.fillRect(0, 0, targetW, targetH);
    } else if (fitBackground === "gradient") {
      const g = ctx.createLinearGradient(0, 0, 0, targetH);
      g.addColorStop(0, fitGradientStart);
      g.addColorStop(1, fitGradientEnd);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, targetW, targetH);
    } else {
      ctx.clearRect(0, 0, targetW, targetH);
    }
    if (srcAspect > dstAspect) {
      drawW = targetW;
      drawH = Math.round(targetW / srcAspect);
    } else {
      drawH = targetH;
      drawW = Math.round(targetH * srcAspect);
    }
    drawW = Math.round(drawW * zoomFactor);
    drawH = Math.round(drawH * zoomFactor);
    const x = Math.round((targetW - drawW) / 2);
    const y = Math.round((targetH - drawH) / 2);
    if (fitBackground === "transparent") ctx.clearRect(0, 0, targetW, targetH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, targetW, targetH);
    ctx.clip();
    ctx.drawImage(img, 0, 0, srcW, srcH, x, y, drawW, drawH);
    ctx.restore();
  } else {
    let baseSW: number;
    let baseSH: number;
    if (srcAspect > dstAspect) {
      baseSH = srcH;
      baseSW = Math.round(srcH * dstAspect);
    } else {
      baseSW = srcW;
      baseSH = Math.round(srcW / dstAspect);
    }
    const sW = Math.round(Math.min(srcW, baseSW / zoomFactor));
    const sH = Math.round(Math.min(srcH, baseSH / zoomFactor));
    const sx = Math.max(0, Math.min(srcW - sW, Math.round((srcW - sW) / 2)));
    const sy = Math.max(0, Math.min(srcH - sH, Math.round((srcH - sH) / 2)));
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, targetW, targetH);
  }

  let outputCanvas: HTMLCanvasElement = canvas;

  if (deviceFrame !== "none") {
    const pad = FRAME_PADDING[deviceFrame];
    const fw = targetW + pad.left + pad.right;
    const fh = targetH + pad.top + pad.bottom;
    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = fw;
    frameCanvas.height = fh;
    const fctx = frameCanvas.getContext("2d", { alpha: true });
    if (fctx) {
      const bezel = "#1a1a1a";
      fctx.fillStyle = bezel;
      fctx.fillRect(0, 0, fw, fh);
      const r = deviceFrame === "ipad" ? 32 : deviceFrame === "android" ? 28 : 36;
      fctx.save();
      fctx.beginPath();
      fctx.roundRect(pad.left, pad.top, targetW, targetH, r);
      fctx.clip();
      fctx.drawImage(canvas, pad.left, pad.top, targetW, targetH);
      fctx.restore();
      if (deviceFrame === "iphone") {
        const notchW = Math.min(120, targetW * 0.35);
        const notchH = 28;
        fctx.fillStyle = bezel;
        fctx.beginPath();
        fctx.roundRect(pad.left + (targetW - notchW) / 2, pad.top - 2, notchW, notchH + 4, 14);
        fctx.fill();
      }
      outputCanvas = frameCanvas;
    }
  }

  const q = outFormat === "image/png" ? undefined : Math.min(0.95, Math.max(0.4, quality / 100));
  const blob: Blob = await new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Export failed"))),
      outFormat,
      q
    );
  });

  return blob;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Page() {
  const [files, setFiles] = useState<File[]>([]);
  const [origInfo, setOrigInfo] = useState<{ w: number; h: number; size: number } | null>(null);

  const [presetKey, setPresetKey] = useState<string>("ios_iphone_69");
  const preset = useMemo(() => PRESETS.find((p) => p.key === presetKey) || PRESETS[0], [presetKey]);

  const [custom, setCustom] = useState(false);
  const [targetW, setTargetW] = useState<number>(preset.w);
  const [targetH, setTargetH] = useState<number>(preset.h);

  const [mode, setMode] = useState<Mode>("fill");
  const [outFormat, setOutFormat] = useState<OutFormat>("image/webp");
  const [quality, setQuality] = useState<number>(82);

  const [fitBackground, setFitBackground] = useState<FitBackground>("transparent");
  const [fitSolidColor, setFitSolidColor] = useState<string>("#000000");
  const [fitGradientStart, setFitGradientStart] = useState<string>("#1a1a2e");
  const [fitGradientEnd, setFitGradientEnd] = useState<string>("#16213e");

  const [deviceFrame, setDeviceFrame] = useState<DeviceFrame>("none");

  const [zoom, setZoom] = useState<number>(100);

  const [busy, setBusy] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const lastPreviewUrls = useRef<string[]>([]);

  const file = files[0] ?? null;

  useEffect(() => {
    if (!custom) {
      setTargetW(preset.w);
      setTargetH(preset.h);
    }
  }, [presetKey, custom, preset.w, preset.h]);

  useEffect(() => {
    makeSessionId();
  }, []);

  useEffect(() => {
    return () => {
      lastPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      lastPreviewUrls.current = [];
    };
  }, []);

  function clearAllFilters() {
    setPresetKey("ios_iphone_69");
    setCustom(false);
    setTargetW(1290);
    setTargetH(2796);
    setMode("fill");
    setOutFormat("image/webp");
    setQuality(82);
    setFitBackground("transparent");
    setFitSolidColor("#000000");
    setFitGradientStart("#1a1a2e");
    setFitGradientEnd("#16213e");
    setDeviceFrame("none");
    setZoom(100);
    track("clear_filters");
  }

  async function onPickFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const arr = Array.from(fileList);
    setFiles(arr);
    track("upload_selected", { count: arr.length, type: arr[0]?.type, size: arr[0]?.size });
    const first = arr[0];
    if (first) {
      const img = await loadImage(first);
      setOrigInfo({ w: img.naturalWidth, h: img.naturalHeight, size: first.size });
    } else {
      setOrigInfo(null);
    }
  }

  async function buildPreview() {
    if (files.length === 0) return;
    setBusy(true);
    try {
      track("preview_clicked", { presetKey, targetW, targetH, mode, outFormat, count: files.length });

      lastPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      lastPreviewUrls.current = [];

      const urls: string[] = [];
      for (const f of files) {
        const blob = await exportProcessed({
          file: f,
          targetW,
          targetH,
          mode,
          outFormat,
          quality,
          fitBackground,
          fitSolidColor,
          fitGradientStart,
          fitGradientEnd,
          deviceFrame,
          zoom,
        });
        const url = URL.createObjectURL(blob);
        urls.push(url);
        lastPreviewUrls.current.push(url);
      }

      setPreviewUrls(urls);
      track("preview_ready", { count: urls.length });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!file) return;
    setBusy(true);
    try {
      track("download_clicked", { presetKey, targetW, targetH, mode, outFormat, quality });

      const blob = await exportProcessed({
        file,
        targetW,
        targetH,
        mode,
        outFormat,
        quality,
        fitBackground,
        fitSolidColor,
        fitGradientStart,
        fitGradientEnd,
          deviceFrame,
          zoom,
        });
      const ext = outFormat === "image/png" ? "png" : outFormat === "image/jpeg" ? "jpg" : "webp";
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      downloadBlob(blob, `${base}_${targetW}x${targetH}.${ext}`);

      track("download_completed", { outSize: blob.size });
    } finally {
      setBusy(false);
    }
  }

  async function downloadBatch() {
    if (files.length === 0) return;
    setBusy(true);
    try {
      track("batch_download_clicked", { count: files.length, presetKey, targetW, targetH, mode, outFormat });
      const zip = new JSZip();
      const ext = outFormat === "image/png" ? "png" : outFormat === "image/jpeg" ? "jpg" : "webp";

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const blob = await exportProcessed({
          file: f,
          targetW,
          targetH,
          mode,
          outFormat,
          quality,
          fitBackground,
          fitSolidColor,
          fitGradientStart,
          fitGradientEnd,
          deviceFrame,
          zoom,
        });
        const base = f.name.replace(/\.[^.]+$/, "") || `image_${i + 1}`;
        zip.file(`${base}_${targetW}x${targetH}.${ext}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      downloadBlob(zipBlob, "storeshot_batch.zip");
      track("batch_download_completed", { count: files.length });
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Preset[]>();
    for (const p of PRESETS) {
      m.set(p.group, [...(m.get(p.group) || []), p]);
    }
    return Array.from(m.entries());
  }, []);

  const cardStyle: React.CSSProperties = {
    padding: 18,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 14,
  };
  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--foreground)",
    fontSize: 14,
  };
  const buttonPrimary: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 500,
    cursor: "pointer",
  };
  const buttonSecondary: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--foreground)",
    cursor: "pointer",
  };

  const CoffeeMug = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {/* mug body */}
      <path d="M6 6h9v9a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 6 15V6Z" />
      {/* handle */}
      <path d="M15 9h1.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H15" />
      {/* steam */}
      <path d="M8.5 4c.5-.5 1.5-.5 2 0" strokeWidth="1" strokeLinecap="round" />
      <path d="M11 3c.4-.4 1.2-.4 1.6 0" strokeWidth="1" strokeLinecap="round" />
      <path d="M13.5 4c.5-.5 1.5-.5 2 0" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );

  return (
    <main style={{ maxWidth: 860, margin: "40px auto", padding: 24, fontFamily: "var(--font-geist-sans), system-ui, sans-serif", color: "var(--foreground)", minHeight: "100vh" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em" }}>StoreShot</h1>
          <p style={{ marginTop: 8, fontSize: 15, color: "var(--muted)" }}>
            Prepare App Store and Google Play screenshots. Images are processed in your browser and never uploaded.
          </p>
        </div>
        <a
          href="https://www.paypal.com/ncp/payment/LJN2AA87SPHTN"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            color: "var(--muted)",
            fontSize: 13,
            textDecoration: "none",
            transition: "background 0.2s, color 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.08)";
            e.currentTarget.style.color = "var(--foreground)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            e.currentTarget.style.color = "var(--muted)";
          }}
        >
          <CoffeeMug />
          <span>Support this developer, buy a coffee!</span>
        </a>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 22 }}>
        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>1 Upload</h2>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const list = e.dataTransfer.files;
              if (list?.length) void onPickFiles(list);
            }}
            style={{
              marginTop: 12,
              padding: 20,
              border: "1px dashed var(--border)",
              borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onPickFiles(e.target.files)}
              style={{ fontSize: 13, color: "var(--foreground)" }}
            />
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Drag and drop also works. Select multiple for batch.
            </p>
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
              {files.length === 1 ? (
                origInfo && (
                  <span>
                    Original: {origInfo.w}×{origInfo.h} • {formatBytes(origInfo.size)}
                  </span>
                )
              ) : (
                <span>{files.length} images selected</span>
              )}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>2 Resize settings</h2>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--foreground)" }}>
              <input
                type="checkbox"
                checked={custom}
                onChange={(e) => {
                  setCustom(e.target.checked);
                  track("toggle_custom", { on: e.target.checked });
                }}
              />
              Use custom size
            </label>

            {!custom ? (
              <select
                value={presetKey}
                onChange={(e) => {
                  setPresetKey(e.target.value);
                  track("preset_selected", { presetKey: e.target.value });
                }}
                style={inputStyle}
              >
                {grouped.map(([group, items]) => (
                  <optgroup key={group} label={group}>
                    {items.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <input type="number" value={targetW} onChange={(e) => setTargetW(parseInt(e.target.value || "0", 10))} placeholder="Width" style={inputStyle} />
                <input type="number" value={targetH} onChange={(e) => setTargetH(parseInt(e.target.value || "0", 10))} placeholder="Height" style={inputStyle} />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={inputStyle}>
                <option value="fill">Fill (crop)</option>
                <option value="fit">Fit (letterbox)</option>
              </select>

              <select value={outFormat} onChange={(e) => setOutFormat(e.target.value as OutFormat)} style={inputStyle}>
                <option value="image/webp">WebP</option>
                <option value="image/jpeg">JPG</option>
                <option value="image/png">PNG</option>
              </select>
            </div>

            <label style={{ fontSize: 13, color: "var(--muted)", display: "block" }}>
              Zoom: {zoom}%
              <input
                type="range"
                min={80}
                max={120}
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value, 10))}
                style={{ width: "100%", marginTop: 4, accentColor: "var(--accent)" }}
              />
              <span style={{ fontSize: 11, opacity: 0.8 }}>80% = show more, 120% = zoom in</span>
            </label>

            {mode === "fit" && (
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ fontSize: 13, color: "var(--muted)" }}>
                  Letterbox background
                  <select
                    value={fitBackground}
                    onChange={(e) => setFitBackground(e.target.value as FitBackground)}
                    style={{ marginLeft: 8, padding: 8, borderRadius: 8, ...inputStyle }}
                  >
                    <option value="transparent">Transparent</option>
                    <option value="solid">Solid color</option>
                    <option value="gradient">Gradient</option>
                  </select>
                </label>
                {fitBackground === "solid" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>Color</span>
                    <input
                      type="color"
                      value={fitSolidColor}
                      onChange={(e) => setFitSolidColor(e.target.value)}
                      style={{ width: 40, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 6, background: "transparent", cursor: "pointer" }}
                    />
                    <input
                      type="text"
                      value={fitSolidColor}
                      onChange={(e) => setFitSolidColor(e.target.value)}
                      style={{ width: 90, padding: 6, borderRadius: 6, fontFamily: "var(--font-geist-mono), monospace", fontSize: 12, ...inputStyle }}
                    />
                  </div>
                )}
                {fitBackground === "gradient" && (
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="color" value={fitGradientStart} onChange={(e) => setFitGradientStart(e.target.value)} style={{ width: 32, height: 24, padding: 0, border: "1px solid var(--border)", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
                      <input type="text" value={fitGradientStart} onChange={(e) => setFitGradientStart(e.target.value)} style={{ width: 72, padding: 4, borderRadius: 4, fontFamily: "monospace", fontSize: 11, ...inputStyle }} />
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="color" value={fitGradientEnd} onChange={(e) => setFitGradientEnd(e.target.value)} style={{ width: 32, height: 24, padding: 0, border: "1px solid var(--border)", borderRadius: 4, background: "transparent", cursor: "pointer" }} />
                      <input type="text" value={fitGradientEnd} onChange={(e) => setFitGradientEnd(e.target.value)} style={{ width: 72, padding: 4, borderRadius: 4, fontFamily: "monospace", fontSize: 11, ...inputStyle }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <label style={{ fontSize: 13, color: "var(--muted)" }}>
              Device frame
              <select
                value={deviceFrame}
                onChange={(e) => setDeviceFrame(e.target.value as DeviceFrame)}
                style={{ marginLeft: 8, padding: 8, borderRadius: 8, ...inputStyle }}
              >
                <option value="none">None</option>
                <option value="iphone">iPhone</option>
                <option value="ipad">iPad</option>
                <option value="android">Android</option>
              </select>
            </label>

            <label style={{ fontSize: 13, color: "var(--muted)", display: "block" }}>
              Quality: {quality}
              <input
                type="range"
                min={40}
                max={95}
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                disabled={outFormat === "image/png"}
                style={{ width: "100%", marginTop: 4, accentColor: "var(--accent)" }}
              />
              {outFormat === "image/png" && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>PNG ignores quality.</div>}
            </label>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <button onClick={() => void buildPreview()} disabled={files.length === 0 || busy} style={{ ...buttonPrimary, opacity: files.length === 0 || busy ? 0.6 : 1 }}>
                {busy ? "Working…" : "Preview"}
              </button>
              <button onClick={() => void download()} disabled={!file || busy} style={{ ...buttonSecondary, opacity: !file || busy ? 0.6 : 1 }}>
                Download
              </button>
              {files.length > 1 && (
                <button onClick={() => void downloadBatch()} disabled={busy} style={{ ...buttonSecondary, opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Working…" : `Download ZIP (${files.length})`}
                </button>
              )}
              <button onClick={clearAllFilters} style={{ ...buttonSecondary, fontSize: 12 }}>
                Clear all filters
              </button>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Tip: Fill is best for store screenshots. Fit avoids cropping.
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18, ...cardStyle }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>Preview</h2>
        {previewUrls.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: previewUrls.length === 1 ? "1fr auto" : "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 14,
                alignItems: "start",
              }}
            >
              {previewUrls.map((url, i) => (
                <div key={url} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <img
                    src={url}
                    alt={`Processed preview ${i + 1}`}
                    style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
                  />
                  {previewUrls.length > 1 && (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{i + 1} of {previewUrls.length}</span>
                  )}
                </div>
              ))}
              {previewUrls.length === 1 && (
                <div style={{ fontSize: 13, color: "var(--muted)", minWidth: 140 }}>
                  Output: {deviceFrame === "none" ? `${targetW}×${targetH}` : `${targetW + FRAME_PADDING[deviceFrame].left + FRAME_PADDING[deviceFrame].right}×${targetH + FRAME_PADDING[deviceFrame].top + FRAME_PADDING[deviceFrame].bottom}`}
                  {deviceFrame !== "none" && <span style={{ fontSize: 12 }}> (with frame)</span>}
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    Images are processed locally. Nothing is uploaded or stored.
                  </div>
                </div>
              )}
            </div>
            {previewUrls.length > 1 && (
              <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
                Output: {deviceFrame === "none" ? `${targetW}×${targetH}` : `${targetW + FRAME_PADDING[deviceFrame].left + FRAME_PADDING[deviceFrame].right}×${targetH + FRAME_PADDING[deviceFrame].top + FRAME_PADDING[deviceFrame].bottom}`}
                {deviceFrame !== "none" && <span style={{ fontSize: 12 }}> (with frame)</span>}
                <span style={{ marginLeft: 8 }}> • {previewUrls.length} images</span>
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Images are processed locally. Nothing is uploaded or stored.
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ marginTop: 10, color: "var(--muted)" }}>Click Preview to see the result here.</p>
        )}
      </section>
    </main>
  );
}
