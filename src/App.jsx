import { useEffect, useMemo, useRef, useState } from 'react';

const CANVAS_PRESETS = {
  twitter_landscape: { label: 'Twitter/X (1200×675)', width: 1200, height: 675 },
  social_card: { label: 'Open Graph (1200×630)', width: 1200, height: 630 },
  instagram_square: { label: 'Instagram (1080×1080)', width: 1080, height: 1080 },
  linkedin: { label: 'LinkedIn (1200×627)', width: 1200, height: 627 },
  custom: { label: 'Custom', width: 1200, height: 630 }
};

const DEFAULTS = {
  url: 'https://example.com',
  mode: 'solid',
  bgSolid: '#111827',
  bgA: '#0f172a',
  bgB: '#6d28d9',
  bgC: '#22d3ee',
  gradientStops: 3,
  gradientAngle: 135,
  preset: 'social_card',
  canvasWidth: 1200,
  canvasHeight: 630,
  browserWidth: 980,
  browserHeight: 560,
  fullPage: false,
  padding: 48,
  radius: 20,
  shadow: 38,
  frameStyle: 'mac-dark',
  showUrlBar: true
};

function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  const parsed = { ...DEFAULTS };
  for (const [k, v] of params.entries()) {
    if (!(k in parsed)) continue;
    if (typeof parsed[k] === 'number') parsed[k] = Number(v);
    else if (typeof parsed[k] === 'boolean') parsed[k] = v === 'true';
    else parsed[k] = v;
  }
  return parsed;
}

function fitRect(sourceW, sourceH, targetW, targetH) {
  const sourceRatio = sourceW / sourceH;
  const targetRatio = targetW / targetH;

  let drawW;
  let drawH;
  if (sourceRatio > targetRatio) {
    drawH = targetH;
    drawW = drawH * sourceRatio;
  } else {
    drawW = targetW;
    drawH = drawW / sourceRatio;
  }

  return {
    drawW,
    drawH,
    offsetX: (targetW - drawW) / 2,
    offsetY: (targetH - drawH) / 2
  };
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFrame({ ctx, x, y, w, h, style, showUrlBar, url }) {
  const isDark = style.includes('dark');
  const topBarH = showUrlBar ? 52 : 34;

  ctx.fillStyle = isDark ? '#111827' : '#f8fafc';
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.fillStyle = isDark ? '#1f2937' : '#e2e8f0';
  roundRectPath(ctx, x, y, w, topBarH, 14);
  ctx.fill();

  const dotY = y + topBarH / 2;
  const dotStart = x + 22;
  ['#fb7185', '#facc15', '#4ade80'].forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dotStart + i * 16, dotY, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  if (showUrlBar) {
    ctx.fillStyle = isDark ? '#374151' : '#ffffff';
    roundRectPath(ctx, x + 95, y + 13, w - 120, 26, 8);
    ctx.fill();
    ctx.fillStyle = isDark ? '#9ca3af' : '#64748b';
    ctx.font = '14px Inter, Arial, sans-serif';
    const cleanUrl = url.replace(/^https?:\/\//, '');
    ctx.fillText(cleanUrl, x + 108, y + 31);
  }

  return { topBarH };
}

function App() {
  const [state, setState] = useState(parseUrlState);
  const [status, setStatus] = useState('Paste URL and click “Capture Website”.');
  const [error, setError] = useState('');
  const [imageBitmap, setImageBitmap] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => params.set(k, String(v)));
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}?${query}`);
  }, [state]);

  const frameBounds = useMemo(() => {
    const maxW = state.canvasWidth - state.padding * 2;
    const maxH = state.canvasHeight - state.padding * 2;
    const ratio = state.browserWidth / state.browserHeight;

    let w = Math.min(maxW, state.browserWidth);
    let h = w / ratio;

    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }

    return {
      x: (state.canvasWidth - w) / 2,
      y: (state.canvasHeight - h) / 2,
      w,
      h
    };
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;

    if (state.mode === 'solid') {
      ctx.fillStyle = state.bgSolid;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const rad = (state.gradientAngle * Math.PI) / 180;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const len = Math.hypot(canvas.width, canvas.height) / 2;
      const x1 = cx - Math.cos(rad) * len;
      const y1 = cy - Math.sin(rad) * len;
      const x2 = cx + Math.cos(rad) * len;
      const y2 = cy + Math.sin(rad) * len;
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, state.bgA);
      if (state.gradientStops === 3) gradient.addColorStop(0.5, state.bgB);
      gradient.addColorStop(1, state.gradientStops === 3 ? state.bgC : state.bgB);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(2, 6, 23, 0.38)';
    ctx.shadowBlur = state.shadow;
    ctx.shadowOffsetY = Math.round(state.shadow / 6);
    roundRectPath(ctx, frameBounds.x, frameBounds.y, frameBounds.w, frameBounds.h, state.radius);
    ctx.fillStyle = state.frameStyle.includes('dark') ? '#0f172a' : '#f8fafc';
    ctx.fill();
    ctx.restore();

    const { topBarH } = drawFrame({
      ctx,
      x: frameBounds.x,
      y: frameBounds.y,
      w: frameBounds.w,
      h: frameBounds.h,
      style: state.frameStyle,
      showUrlBar: state.showUrlBar,
      url: state.url
    });

    const contentX = frameBounds.x + 1;
    const contentY = frameBounds.y + topBarH;
    const contentW = frameBounds.w - 2;
    const contentH = frameBounds.h - topBarH - 1;

    ctx.save();
    roundRectPath(ctx, contentX, contentY, contentW, contentH, 10);
    ctx.clip();

    if (imageBitmap) {
      const fit = fitRect(imageBitmap.width, imageBitmap.height, contentW, contentH);
      ctx.drawImage(imageBitmap, contentX + fit.offsetX, contentY + fit.offsetY, fit.drawW, fit.drawH);
    } else {
      ctx.fillStyle = state.frameStyle.includes('dark') ? '#0b1120' : '#e2e8f0';
      ctx.fillRect(contentX, contentY, contentW, contentH);
      ctx.fillStyle = state.frameStyle.includes('dark') ? '#cbd5e1' : '#334155';
      ctx.font = '500 24px Inter, Arial, sans-serif';
      ctx.fillText('No website screenshot yet', contentX + 28, contentY + 44);
      ctx.font = '400 16px Inter, Arial, sans-serif';
      ctx.fillText('Use Capture Website or upload your own screenshot.', contentX + 28, contentY + 74);
    }
    ctx.restore();
  }, [state, imageBitmap, frameBounds]);

  const setField = (field, value) => setState((prev) => ({ ...prev, [field]: value }));

  const handlePreset = (preset) => {
    const p = CANVAS_PRESETS[preset];
    setState((prev) => ({
      ...prev,
      preset,
      canvasWidth: p.width,
      canvasHeight: p.height
    }));
  };

  const mockCapture = async () => {
    setError('');
    setIsLoading(true);
    setStatus('Select a browser tab showing your URL to capture a frame.');

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: { ideal: state.browserWidth }, height: { ideal: state.browserHeight } },
        audio: false,
        preferCurrentTab: true
      });

      const track = stream.getVideoTracks()[0];
      const bitmap = await captureStreamFrame(track, state.browserWidth, state.browserHeight);
      setImageBitmap(bitmap);
      track.stop();
      setStatus('Captured from shared tab/window. You can now export.');
    } catch (captureErr) {
      setError('Screen capture was blocked/cancelled. Upload a screenshot as fallback.');
      setStatus('Capture cancelled or unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = await loadImage(objectUrl, 10000);
    URL.revokeObjectURL(objectUrl);
    setImageBitmap(img);
    setError('');
    setStatus('Uploaded screenshot applied.');
  };

  const download = (scale = 2, type = 'png') => {
    const src = canvasRef.current;
    if (!src) return;
    const out = document.createElement('canvas');
    out.width = state.canvasWidth * scale;
    out.height = state.canvasHeight * scale;
    const ctx = out.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(src, 0, 0);
    const mime = type === 'jpeg' ? 'image/jpeg' : 'image/png';
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `framelab-${state.canvasWidth}x${state.canvasHeight}@${scale}x.${type === 'jpeg' ? 'jpg' : 'png'}`;
      a.click();
      URL.revokeObjectURL(url);
    }, mime, 0.94);
  };

  const copyToClipboard = async () => {
    try {
      const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus('Copied PNG to clipboard.');
    } catch {
      setStatus('Clipboard unavailable in this browser. Download instead.');
    }
  };

  const shareConfig = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus('Shareable configuration link copied.');
    } catch {
      setStatus('Could not copy link.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3 md:px-6">
        <h1 className="text-xl font-semibold">FrameLab</h1>
        <p className="text-sm text-slate-400">Create social-ready floating browser mockups from a URL.</p>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 md:grid-cols-[390px_1fr] md:p-6">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <Control label="Website URL">
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.url} onChange={(e) => setField('url', e.target.value)} />
              <button className="rounded-lg bg-indigo-500 px-3 text-sm font-medium hover:bg-indigo-400 disabled:opacity-50" onClick={mockCapture} disabled={isLoading}>
                {isLoading ? 'Loading…' : 'Capture'}
              </button>
            </div>
          </Control>

          <Control label="Fallback upload">
            <input type="file" accept="image/*" onChange={onUpload} className="w-full text-sm" />
          </Control>

          <Control label="Preset">
            <select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.preset} onChange={(e) => handlePreset(e.target.value)}>
              {Object.entries(CANVAS_PRESETS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
          </Control>

          <TwoCols>
            <NumberField label="Canvas W" value={state.canvasWidth} onChange={(v) => setField('canvasWidth', v)} />
            <NumberField label="Canvas H" value={state.canvasHeight} onChange={(v) => setField('canvasHeight', v)} />
          </TwoCols>
          <TwoCols>
            <NumberField label="Browser W" value={state.browserWidth} onChange={(v) => setField('browserWidth', v)} />
            <NumberField label="Browser H" value={state.browserHeight} onChange={(v) => setField('browserHeight', v)} />
          </TwoCols>

          <TwoCols>
            <NumberField label="Padding" value={state.padding} onChange={(v) => setField('padding', v)} />
            <NumberField label="Radius" value={state.radius} onChange={(v) => setField('radius', v)} />
          </TwoCols>
          <NumberField label="Shadow blur" value={state.shadow} onChange={(v) => setField('shadow', v)} />

          <Control label="Frame style">
            <select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.frameStyle} onChange={(e) => setField('frameStyle', e.target.value)}>
              <option value="mac-dark">Mac Dark</option>
              <option value="mac-light">Mac Light</option>
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={state.showUrlBar} onChange={(e) => setField('showUrlBar', e.target.checked)} /> Show URL bar
            </label>
          </Control>

          <Control label="Background">
            <div className="space-y-2">
              <select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.mode} onChange={(e) => setField('mode', e.target.value)}>
                <option value="solid">Solid</option>
                <option value="gradient">Gradient</option>
              </select>
              {state.mode === 'solid' ? (
                <ColorRow label="Solid color" color={state.bgSolid} onChange={(v) => setField('bgSolid', v)} />
              ) : (
                <>
                  <ColorRow label="Color A" color={state.bgA} onChange={(v) => setField('bgA', v)} />
                  <ColorRow label="Color B" color={state.bgB} onChange={(v) => setField('bgB', v)} />
                  {state.gradientStops === 3 && <ColorRow label="Color C" color={state.bgC} onChange={(v) => setField('bgC', v)} />}
                  <div className="flex items-center justify-between text-sm">
                    <span>Stops</span>
                    <select className="rounded-lg border border-slate-700 bg-slate-950 p-1" value={state.gradientStops} onChange={(e) => setField('gradientStops', Number(e.target.value))}>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                    </select>
                  </div>
                  <NumberField label="Angle" value={state.gradientAngle} onChange={(v) => setField('gradientAngle', v)} />
                </>
              )}
            </div>
          </Control>

          <Control label="Export">
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium hover:bg-emerald-400" onClick={() => download(2, 'png')}>PNG @2x</button>
              <button className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium hover:bg-emerald-400" onClick={() => download(3, 'png')}>PNG @3x</button>
              <button className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-medium hover:bg-cyan-400" onClick={() => download(2, 'jpeg')}>JPG @2x</button>
              <button className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium hover:bg-indigo-400" onClick={copyToClipboard}>Copy PNG</button>
              <button className="col-span-2 rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium hover:bg-violet-400" onClick={shareConfig}>Copy share link</button>
            </div>
          </Control>

          <p className="text-sm text-slate-300">{status}</p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="overflow-auto rounded-lg bg-black/30 p-3">
            <canvas ref={canvasRef} className="mx-auto w-full max-w-full rounded-lg border border-slate-700" />
          </div>
        </section>
      </main>
    </div>
  );
}

function Control({ label, children }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <div>{children}</div>
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-slate-300">{label}</span>
      <input
        type="number"
        value={value}
        min={0}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2"
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function TwoCols({ children }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function ColorRow({ label, color, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950 p-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-slate-400">{color}</span>
        <input type="color" value={color} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

async function captureStreamFrame(track, width, height) {
  if ('ImageCapture' in window) {
    const imageCapture = new ImageCapture(track);
    return imageCapture.grabFrame();
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.srcObject = new MediaStream([track]);
    video.muted = true;
    video.onloadedmetadata = () => {
      video.play().then(() => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Frame conversion failed'));
        img.src = c.toDataURL('image/png');
      }).catch(reject);
    };
    video.onerror = () => reject(new Error('Video stream failed'));
  });
}

function loadImage(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Timed out')), timeout);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Image failed')); 
    };
    img.src = url;
  });
}

export default App;
