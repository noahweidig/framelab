import { useEffect, useMemo, useRef, useState } from 'react';

const CANVAS_PRESETS = {
  twitter_landscape: { label: 'Twitter/X (1200×675)', width: 1200, height: 675 },
  social_card: { label: 'Open Graph (1200×630)', width: 1200, height: 630 },
  instagram_square: { label: 'Instagram (1080×1080)', width: 1080, height: 1080 },
  linkedin: { label: 'LinkedIn (1200×627)', width: 1200, height: 627 },
  custom: { label: 'Custom', width: 1200, height: 630 }
};

const EXPORT_FORMATS = {
  png: { label: 'PNG', type: 'image/png', extension: 'png' },
  jpeg: { label: 'JPEG', type: 'image/jpeg', extension: 'jpg' },
  webp: { label: 'WebP', type: 'image/webp', extension: 'webp' }
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
  zoom: 1,
  padding: 48,
  radius: 20,
  shadow: 38,
  frameStyle: 'mac-dark',
  showUrlBar: true,
  exportFormat: 'png',
  exportQuality: 0.92
};

async function loadRemoteSnapshot(url) {
  const endpoint = `https://image.thum.io/get/width/1600/noanimate/${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Snapshot service returned ${response.status}`);
  }
  const blob = await response.blob();
  return createImageBitmap(blob);
}

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

function getBgStyle(state) {
  if (state.mode === 'solid') return { background: state.bgSolid };

  const stops =
    state.gradientStops === 3
      ? `${state.bgA} 0%, ${state.bgB} 50%, ${state.bgC} 100%`
      : `${state.bgA} 0%, ${state.bgB} 100%`;
  return { background: `linear-gradient(${state.gradientAngle}deg, ${stops})` };
}

function App() {
  const [state, setState] = useState(parseUrlState);
  const [status, setStatus] = useState('Preview is ready. Adjust zoom and export a direct image file.');
  const [error, setError] = useState('');
  const [previewLayout, setPreviewLayout] = useState({
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    frameWidth: state.browserWidth,
    frameHeight: state.browserHeight,
    frameOffsetX: 0,
    frameOffsetY: 0
  });
  const viewportRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => params.set(k, String(v)));
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [state]);

  useEffect(() => {
    const updateFrameSize = () => {
      const container = viewportRef.current;
      if (!container) return;

      const maxW = Math.max(320, container.clientWidth - 24);
      const maxH = Math.max(220, container.clientHeight - 24);

      const canvasScale = Math.min(maxW / state.canvasWidth, maxH / state.canvasHeight, 1);
      const canvasWidth = state.canvasWidth * canvasScale;
      const canvasHeight = state.canvasHeight * canvasScale;

      const scaledPadding = Math.max(0, state.padding * canvasScale);
      const contentW = Math.max(120, canvasWidth - scaledPadding * 2);
      const contentH = Math.max(100, canvasHeight - scaledPadding * 2);
      const browserScale = Math.min(contentW / state.browserWidth, contentH / state.browserHeight);

      const frameWidth = Math.max(100, state.browserWidth * browserScale);
      const frameHeight = Math.max(80, state.browserHeight * browserScale);

      setPreviewLayout({
        canvasWidth,
        canvasHeight,
        frameWidth,
        frameHeight,
        frameOffsetX: (canvasWidth - frameWidth) / 2,
        frameOffsetY: (canvasHeight - frameHeight) / 2
      });
    };

    updateFrameSize();

    const observer = new ResizeObserver(updateFrameSize);
    if (viewportRef.current) observer.observe(viewportRef.current);
    window.addEventListener('resize', updateFrameSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateFrameSize);
    };
  }, [state.browserWidth, state.browserHeight, state.canvasWidth, state.canvasHeight, state.padding]);

  const frameTheme = useMemo(() => {
    const dark = state.frameStyle.includes('dark');
    return {
      shell: dark ? '#1f2937' : '#e2e8f0',
      pageBg: dark ? '#0b1120' : '#ffffff',
      urlPill: dark ? '#374151' : '#ffffff',
      urlText: dark ? '#9ca3af' : '#64748b',
      border: dark ? '#0f172a' : '#cbd5e1',
      placeholderTitle: dark ? '#e2e8f0' : '#0f172a',
      placeholderText: dark ? '#94a3b8' : '#475569'
    };
  }, [state.frameStyle]);

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

  const applyUrl = () => {
    setError('');
    setStatus(`Loaded ${state.url}. Export renders straight to a downloadable image file.`);
  };

  const roundedRect = (ctx, x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  };

  const exportFrame = async () => {
    setError('');

    const fmt = EXPORT_FORMATS[state.exportFormat] || EXPORT_FORMATS.png;
    const { canvasWidth, canvasHeight, browserWidth, browserHeight, padding, radius, showUrlBar, zoom } = state;
    const urlBarHeight = showUrlBar ? 52 : 34;
    const contentWidth = Math.max(120, canvasWidth - padding * 2);
    const contentHeight = Math.max(120, canvasHeight - padding * 2);
    const frameScale = Math.min(contentWidth / browserWidth, contentHeight / browserHeight);
    const frameW = browserWidth * frameScale;
    const frameH = browserHeight * frameScale;
    const frameX = (canvasWidth - frameW) / 2;
    const frameY = (canvasHeight - frameH) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Canvas rendering is not available in this browser.');
      return;
    }

    if (state.mode === 'solid') {
      ctx.fillStyle = state.bgSolid;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    } else {
      const angle = (state.gradientAngle * Math.PI) / 180;
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const length = Math.hypot(canvasWidth, canvasHeight) / 2;
      const x0 = cx - Math.cos(angle) * length;
      const y0 = cy - Math.sin(angle) * length;
      const x1 = cx + Math.cos(angle) * length;
      const y1 = cy + Math.sin(angle) * length;
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, state.bgA);
      if (state.gradientStops === 3) gradient.addColorStop(0.5, state.bgB);
      gradient.addColorStop(1, state.gradientStops === 3 ? state.bgC : state.bgB);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    ctx.shadowColor = 'rgba(2, 6, 23, 0.38)';
    ctx.shadowBlur = state.shadow;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.round(state.shadow / 6);
    ctx.fillStyle = frameTheme.shell;
    roundedRect(ctx, frameX, frameY, frameW, frameH, radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.strokeStyle = frameTheme.border;
    ctx.lineWidth = 2;
    roundedRect(ctx, frameX, frameY, frameW, frameH, radius);
    ctx.stroke();

    ctx.fillStyle = frameTheme.shell;
    roundedRect(ctx, frameX, frameY, frameW, urlBarHeight, Math.max(6, radius - 2));
    ctx.fill();

    const dotY = frameY + 20;
    [ '#fb7185', '#facc15', '#4ade80' ].forEach((color, i) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(frameX + 18 + i * 14, dotY, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (showUrlBar) {
      const pillX = frameX + 70;
      const pillY = frameY + 11;
      const pillW = frameW - 85;
      const pillH = 22;
      ctx.fillStyle = frameTheme.urlPill;
      roundedRect(ctx, pillX, pillY, pillW, pillH, 7);
      ctx.fill();
      ctx.font = `${Math.max(11, Math.floor(frameW / 55))}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = frameTheme.urlText;
      ctx.fillText(state.url.replace(/^https?:\/\//, ''), pillX + 10, pillY + 15);
    }

    const bodyX = frameX;
    const bodyY = frameY + urlBarHeight;
    const bodyW = frameW;
    const bodyH = frameH - urlBarHeight;
    ctx.fillStyle = frameTheme.pageBg;
    ctx.fillRect(bodyX, bodyY, bodyW, bodyH);

    let drewSnapshot = false;
    try {
      const snapshot = await loadRemoteSnapshot(state.url);
      const snapshotRatio = snapshot.width / snapshot.height;
      const targetRatio = bodyW / bodyH;
      let drawW = bodyW;
      let drawH = bodyH;
      let drawX = bodyX;
      let drawY = bodyY;

      if (snapshotRatio > targetRatio) {
        drawW = bodyH * snapshotRatio;
        drawX = bodyX - (drawW - bodyW) / 2;
      } else {
        drawH = bodyW / snapshotRatio;
        drawY = bodyY - (drawH - bodyH) / 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(bodyX, bodyY, bodyW, bodyH);
      ctx.clip();
      ctx.drawImage(snapshot, drawX, drawY, drawW, drawH);
      ctx.restore();
      drewSnapshot = true;
    } catch {
      drewSnapshot = false;
    }

    if (!drewSnapshot) {
      ctx.fillStyle = frameTheme.placeholderTitle;
      ctx.font = `600 ${Math.max(16, Math.floor(bodyW / 28))}px Inter, system-ui, sans-serif`;
      ctx.fillText('Export-ready browser frame', bodyX + 24, bodyY + 56);
      ctx.fillStyle = frameTheme.placeholderText;
      ctx.font = `${Math.max(13, Math.floor(bodyW / 42))}px Inter, system-ui, sans-serif`;
      ctx.fillText(`URL: ${state.url}`, bodyX + 24, bodyY + 88);
      ctx.fillText(`Page zoom: ${zoom.toFixed(2)}x`, bodyX + 24, bodyY + 114);
      ctx.fillText('Could not load a remote snapshot for this site during export.', bodyX + 24, bodyY + 142);
    }

    const quality = fmt.type === 'image/png' ? undefined : state.exportQuality;
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Export failed while generating the image file.');
          return;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `framelab-export.${fmt.extension}`;
        link.click();
        URL.revokeObjectURL(link.href);
        setStatus(
          drewSnapshot
            ? `Downloaded ${fmt.label} export (${canvasWidth}×${canvasHeight}) with a live site snapshot.`
            : `Downloaded ${fmt.label} export (${canvasWidth}×${canvasHeight}) without a live snapshot (fallback content used).`
        );
      },
      fmt.type,
      quality
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 md:px-6">
        <h1 className="text-xl font-semibold">FrameLab</h1>
        <p className="text-sm text-slate-400">Design social-ready browser frames with direct PNG/JPEG/WebP export.</p>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 md:grid-cols-[390px_1fr] md:p-6">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:sticky md:top-4 md:h-[calc(100vh-2rem)] md:overflow-auto">
          <Control label="Website URL">
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.url} onChange={(e) => setField('url', e.target.value)} />
              <button className="rounded-lg bg-indigo-500 px-3 text-sm font-medium hover:bg-indigo-400" onClick={applyUrl}>Load</button>
            </div>
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

          <Control label="Page zoom (preview)">
            <div className="flex items-center gap-3">
              <input type="range" min={0.5} max={2} step={0.05} value={state.zoom} className="w-full" onChange={(e) => setField('zoom', Number(e.target.value))} />
              <span className="w-14 text-right font-mono text-sm">{state.zoom.toFixed(2)}x</span>
            </div>
          </Control>

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
            <TwoCols>
              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">Format</span>
                <select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.exportFormat} onChange={(e) => setField('exportFormat', e.target.value)}>
                  {Object.entries(EXPORT_FORMATS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
              </label>
              <NumberField label="Quality (0-1)" value={state.exportQuality} onChange={(v) => setField('exportQuality', Math.max(0.1, Math.min(1, v)))} />
            </TwoCols>
            <button className="mt-2 w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium hover:bg-emerald-400" onClick={exportFrame}>Download image</button>
            <p className="mt-2 text-xs text-slate-400">Export automatically tries loading a live snapshot of the URL before downloading.</p>
          </Control>

          <p className="text-sm text-slate-300">{status}</p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3" style={getBgStyle(state)}>
          <div ref={viewportRef} className="h-[75vh] min-h-[420px] w-full overflow-hidden rounded-lg p-3">
            <div className="relative mx-auto" style={{ width: `${previewLayout.canvasWidth}px`, height: `${previewLayout.canvasHeight}px` }}>
              <div
                className="absolute overflow-hidden"
                style={{
                  left: `${previewLayout.frameOffsetX}px`,
                  top: `${previewLayout.frameOffsetY}px`,
                  width: `${previewLayout.frameWidth}px`,
                  height: `${previewLayout.frameHeight}px`,
                  borderRadius: `${state.radius}px`,
                  boxShadow: `0 ${Math.round(state.shadow / 6)}px ${state.shadow}px rgba(2, 6, 23, 0.38)`,
                  backgroundColor: frameTheme.shell,
                  border: `1px solid ${frameTheme.border}`
                }}
              >
                <div style={{ height: state.showUrlBar ? '52px' : '34px', backgroundColor: frameTheme.shell, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px' }}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  </div>
                  {state.showUrlBar && (
                    <div className="truncate rounded-md px-3 py-1 text-sm" style={{ width: '100%', backgroundColor: frameTheme.urlPill, color: frameTheme.urlText }}>
                      {state.url.replace(/^https?:\/\//, '')}
                    </div>
                  )}
                </div>
                <div style={{ height: state.showUrlBar ? 'calc(100% - 52px)' : 'calc(100% - 34px)', backgroundColor: frameTheme.pageBg, overflow: 'hidden' }}>
                  <div style={{ width: `${100 / state.zoom}%`, height: `${100 / state.zoom}%`, transform: `scale(${state.zoom})`, transformOrigin: 'top left' }}>
                    <iframe
                      key={`${state.url}|${state.browserWidth}x${state.browserHeight}`}
                      title="Live site preview"
                      src={state.url}
                      className="h-full w-full border-0"
                      loading="eager"
                      referrerPolicy="no-referrer"
                      sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts"
                    />
                  </div>
                </div>
              </div>
            </div>
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
      <input type="number" value={value} min={0} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" onChange={(e) => onChange(Number(e.target.value))} />
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

export default App;
