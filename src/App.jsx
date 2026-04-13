import { useEffect, useMemo, useRef, useState } from 'react';

const CANVAS_PRESETS = {
  twitter_landscape: { label: 'Twitter/X (1200×675)', width: 1200, height: 675 },
  social_card: { label: 'Open Graph (1200×630)', width: 1200, height: 630 },
  instagram_square: { label: 'Instagram Square (1080×1080)', width: 1080, height: 1080 },
  instagram_story: { label: 'Instagram Story (1080×1920)', width: 1080, height: 1920 },
  linkedin: { label: 'LinkedIn (1200×627)', width: 1200, height: 627 },
  custom: { label: 'Custom', width: 1200, height: 630 }
};

const EXPORT_FORMATS = {
  png: { label: 'PNG', type: 'image/png', extension: 'png' },
  jpeg: { label: 'JPEG', type: 'image/jpeg', extension: 'jpg' },
  webp: { label: 'WebP', type: 'image/webp', extension: 'webp' }
};

// iPhone 14/15 logical pixel bezels (at 1x)
const PHONE_BEZELS = { side: 13, top: 62, bottom: 13 };

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
  showUrlBar: false,
  exportFormat: 'png',
  exportQuality: 0.92
};

async function loadRemoteSnapshot(url, signal) {
  // Thum.io expects the target URL as a literal path suffix, NOT percent-encoded
  try {
    const response = await fetch(
      `https://image.thum.io/get/width/1600/noanimate/${url}`,
      { mode: 'cors', signal }
    );
    if (response.ok) {
      return createImageBitmap(await response.blob());
    }
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
  }

  // Fallback: Microlink free-tier screenshot API
  const mlRes = await fetch(
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false`,
    { mode: 'cors', signal }
  );
  if (!mlRes.ok) throw new Error(`Snapshot service returned ${mlRes.status}`);
  const { status, data } = await mlRes.json();
  if (status !== 'success' || !data?.screenshot?.url) throw new Error('Snapshot unavailable');
  const imgRes = await fetch(data.screenshot.url, { mode: 'cors', signal });
  if (!imgRes.ok) throw new Error(`Screenshot fetch returned ${imgRes.status}`);
  return createImageBitmap(await imgRes.blob());
}

function normalizeUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    try {
      return new URL(`https://${trimmed}`).toString();
    } catch {
      return '';
    }
  }
}

async function loadSnapshotWithFallbacks(url, signal) {
  const providers = [
    async () => {
      const backendRes = await fetch(
        `/api/snapshot?url=${encodeURIComponent(url)}&w=1600&h=900`,
        { signal }
      );
      if (!backendRes.ok) throw new Error(`Backend snapshot returned ${backendRes.status}`);
      return createImageBitmap(await backendRes.blob());
    },
    () => loadRemoteSnapshot(url, signal),
    async () => {
      const res = await fetch(
        `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1600`,
        { mode: 'cors', signal }
      );
      if (!res.ok) throw new Error(`MShots returned ${res.status}`);
      return createImageBitmap(await res.blob());
    },
    async () => {
      const res = await fetch(
        `https://r.jina.ai/http://image.thum.io/get/width/1600/noanimate/${url}`,
        { mode: 'cors', signal }
      );
      if (!res.ok) throw new Error(`Jina mirror returned ${res.status}`);
      return createImageBitmap(await res.blob());
    }
  ];

  const failures = [];
  for (const getSnapshot of providers) {
    try {
      return await getSnapshot();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      failures.push(error?.message || String(error));
    }
  }
  throw new Error(failures.length ? failures.join(' | ') : 'All snapshot providers failed');
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
  const snapshotCacheRef = useRef(null);
  const normalizedUrl = useMemo(() => normalizeUrl(state.url), [state.url]);

  const isPhone = state.frameStyle.startsWith('iphone');
  const isDark = state.frameStyle.includes('dark');

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(state).forEach(([k, v]) => params.set(k, String(v)));
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [state]);

  useEffect(() => {
    const updateFrameSize = () => {
      const container = viewportRef.current;
      if (!container) return;

      const maxW = Math.max(320, container.clientWidth);
      const maxH = Math.max(220, container.clientHeight);

      const canvasScale = Math.min(maxW / state.canvasWidth, maxH / state.canvasHeight, 1);
      const canvasWidth = state.canvasWidth * canvasScale;
      const canvasHeight = state.canvasHeight * canvasScale;

      const scaledPadding = Math.max(0, state.padding * canvasScale);
      const contentW = Math.max(120, canvasWidth - scaledPadding * 2);
      const contentH = Math.max(100, canvasHeight - scaledPadding * 2);

      let frameWidth, frameHeight;
      if (state.frameStyle.startsWith('iphone')) {
        const phoneBodyW = state.browserWidth + PHONE_BEZELS.side * 2;
        const phoneBodyH = state.browserHeight + PHONE_BEZELS.top + PHONE_BEZELS.bottom;
        const fs = Math.min(contentW / phoneBodyW, contentH / phoneBodyH);
        frameWidth = Math.max(80, phoneBodyW * fs);
        frameHeight = Math.max(120, phoneBodyH * fs);
      } else {
        const browserScale = Math.min(contentW / state.browserWidth, contentH / state.browserHeight);
        frameWidth = Math.max(100, state.browserWidth * browserScale);
        frameHeight = Math.max(80, state.browserHeight * browserScale);
      }

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
  }, [state.browserWidth, state.browserHeight, state.canvasWidth, state.canvasHeight, state.padding, state.frameStyle]);

  const frameTheme = useMemo(() => {
    if (state.frameStyle.startsWith('iphone')) {
      return isDark
        ? {
            shell: '#1c1c1e',
            pageBg: '#000000',
            topFill: '#1c1c1e',
            urlPill: '#2c2c2e',
            urlText: '#8e8e93',
            border: '#3a3a3c',
            placeholderTitle: '#e5e5ea',
            placeholderText: '#8e8e93'
          }
        : {
            shell: '#e8e8ed',
            pageBg: '#ffffff',
            topFill: '#ffffff',
            urlPill: '#f2f2f7',
            urlText: '#6c6c70',
            border: '#c7c7cc',
            placeholderTitle: '#1c1c1e',
            placeholderText: '#6c6c70'
          };
    }
    return isDark
      ? {
          shell: '#1f2937',
          pageBg: '#0b1120',
          urlPill: '#374151',
          urlText: '#9ca3af',
          border: '#0f172a',
          placeholderTitle: '#e2e8f0',
          placeholderText: '#94a3b8'
        }
      : {
          shell: '#e2e8f0',
          pageBg: '#ffffff',
          urlPill: '#ffffff',
          urlText: '#64748b',
          border: '#cbd5e1',
          placeholderTitle: '#0f172a',
          placeholderText: '#475569'
        };
  }, [state.frameStyle, isDark]);

  const setField = (field, value) => setState((prev) => ({ ...prev, [field]: value }));

  const handlePreset = (preset) => {
    const p = CANVAS_PRESETS[preset];
    setState((prev) => ({ ...prev, preset, canvasWidth: p.width, canvasHeight: p.height }));
  };

  // Switching to/from iPhone auto-adjusts browser dimensions to sensible defaults
  const handleFrameStyle = (style) => {
    const wasPhone = state.frameStyle.startsWith('iphone');
    const willBePhone = style.startsWith('iphone');
    if (willBePhone && !wasPhone) {
      setState((prev) => ({
        ...prev,
        frameStyle: style,
        browserWidth: 390,
        browserHeight: 844
      }));
    } else if (!willBePhone && wasPhone) {
      setState((prev) => ({
        ...prev,
        frameStyle: style,
        browserWidth: 980,
        browserHeight: 560
      }));
    } else {
      setField('frameStyle', style);
    }
  };

  const applyUrl = () => {
    setError('');
    if (!normalizedUrl) {
      setError('Enter a valid URL (example: https://example.com).');
      return;
    }
    setStatus(`Fetching snapshot for ${normalizedUrl}…`);
    const url = normalizedUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    loadSnapshotWithFallbacks(url, controller.signal)
      .then((bitmap) => {
        clearTimeout(timeout);
        snapshotCacheRef.current = { url, bitmap };
        setStatus(`Snapshot cached for ${url}. Download is now instant unless URL changes.`);
      })
      .catch((err) => {
        clearTimeout(timeout);
        setError(`Could not prefetch snapshot: ${err?.message || 'unknown error'}`);
        setStatus(`Loaded ${url}. Export will retry snapshot and fall back only if all providers fail.`);
      });
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
    if (!normalizedUrl) {
      setError('Enter a valid URL (example: https://example.com).');
      return;
    }

    const fmt = EXPORT_FORMATS[state.exportFormat] || EXPORT_FORMATS.png;
    const { canvasWidth, canvasHeight, browserWidth, browserHeight, padding, radius, showUrlBar } = state;

    // Use 2x resolution for export to prevent blurriness
    const pixelRatio = 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * pixelRatio;
    canvas.height = canvasHeight * pixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('Canvas rendering is not available in this browser.');
      return;
    }
    ctx.scale(pixelRatio, pixelRatio);

    // --- Background ---
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

    const contentWidth = Math.max(120, canvasWidth - padding * 2);
    const contentHeight = Math.max(120, canvasHeight - padding * 2);

    // Variables for the viewport/screen area where the snapshot is drawn
    let bodyX, bodyY, bodyW, bodyH;
    let clipBody;        // sets ctx path to the screen region
    let postSnapshotDraw = () => {}; // overlays drawn after snapshot

    if (isPhone) {
      // --- iPhone frame ---
      const { side: SIDE, top: TOP, bottom: BOTTOM } = PHONE_BEZELS;
      const phoneBodyW = browserWidth + SIDE * 2;
      const phoneBodyH = browserHeight + TOP + BOTTOM;
      const fs = Math.min(contentWidth / phoneBodyW, contentHeight / phoneBodyH);

      const phoneW = phoneBodyW * fs;
      const phoneH = phoneBodyH * fs;
      const phoneX = (canvasWidth - phoneW) / 2;
      const phoneY = (canvasHeight - phoneH) / 2;

      const sideS = SIDE * fs;
      const topS = TOP * fs;
      const bottomS = BOTTOM * fs;
      const bodyRad = Math.min(44 * fs, phoneW / 4);
      const screenRad = Math.min(38 * fs, (phoneW - sideS * 2) / 4);

      const screenX = phoneX + sideS;
      const screenY = phoneY + topS;
      const screenW = phoneW - sideS * 2;
      const screenH = phoneH - topS - bottomS;

      // Phone body + shadow
      ctx.shadowColor = 'rgba(2,6,23,0.45)';
      ctx.shadowBlur = state.shadow;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.round(state.shadow / 6);
      ctx.fillStyle = frameTheme.shell;
      roundedRect(ctx, phoneX, phoneY, phoneW, phoneH, bodyRad);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Phone body border
      ctx.strokeStyle = frameTheme.border;
      ctx.lineWidth = 1.5;
      roundedRect(ctx, phoneX, phoneY, phoneW, phoneH, bodyRad);
      ctx.stroke();

      // Screen background
      ctx.fillStyle = frameTheme.pageBg;
      roundedRect(ctx, screenX, screenY, screenW, screenH, screenRad);
      ctx.fill();

      const statusBarH = Math.max(16, 32 * fs);
      const diH = Math.max(6, 11 * fs);

      // Adjust body to be below the status bar
      bodyX = screenX;
      bodyY = screenY + statusBarH;
      bodyW = screenW;
      bodyH = screenH - statusBarH;

      clipBody = () => { roundedRect(ctx, bodyX, bodyY, bodyW, bodyH, screenRad); };

      postSnapshotDraw = () => {
        // Status Bar Top Fill
        ctx.fillStyle = frameTheme.topFill;
        ctx.fillRect(screenX, screenY, screenW, statusBarH);

        // Time
        ctx.fillStyle = isDark ? '#ffffff' : '#000000';
        ctx.font = `600 ${14 * fs}px -apple-system, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('9:41', screenX + 16 * fs, screenY + statusBarH / 2);

        // Dynamic Island centered in status bar
        const diW = screenW * 0.3;
        const diX = screenX + (screenW - diW) / 2;
        const diY = screenY + (statusBarH - diH) / 2;

        ctx.fillStyle = '#000000';
        roundedRect(ctx, diX, diY, diW, diH, diH / 2);
        ctx.fill();

        // Camera dot
        const dotSize = diH * 0.4;
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(diX + diH * 0.4 + dotSize / 2, diY + diH / 2, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // WiFi icon placeholder
        const iconColor = isDark ? '#ffffff' : '#000000';
        ctx.fillStyle = iconColor;
        ctx.strokeStyle = iconColor;
        ctx.lineWidth = 1 * fs;
        const rightIconsX = screenX + screenW - 40 * fs;

        // Very basic WiFi curves
        ctx.beginPath();
        ctx.arc(rightIconsX, screenY + statusBarH / 2, 2 * fs, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(rightIconsX, screenY + statusBarH / 2 + 1 * fs, 5 * fs, Math.PI * 1.25, Math.PI * 1.75);
        ctx.stroke();

        // Battery
        const batX = rightIconsX + 10 * fs;
        const batY = screenY + (statusBarH - 10 * fs) / 2;
        ctx.strokeRect(batX, batY, 18 * fs, 10 * fs);
        ctx.fillRect(batX + 2 * fs, batY + 2 * fs, 12 * fs, 6 * fs);
        ctx.beginPath();
        ctx.moveTo(batX + 18 * fs, batY + 3 * fs);
        ctx.lineTo(batX + 20 * fs, batY + 3 * fs);
        ctx.lineTo(batX + 20 * fs, batY + 7 * fs);
        ctx.lineTo(batX + 18 * fs, batY + 7 * fs);
        ctx.stroke();
      };
    } else {
      // --- Mac browser frame ---
      const urlBarHeight = showUrlBar ? 52 : 34;
      const frameScale = Math.min(contentWidth / browserWidth, contentHeight / browserHeight);
      const frameW = browserWidth * frameScale;
      const frameH = browserHeight * frameScale;
      const frameX = (canvasWidth - frameW) / 2;
      const frameY = (canvasHeight - frameH) / 2;
      const rr = Math.min(radius, frameW / 2, frameH / 2);

      // Shadow
      ctx.shadowColor = 'rgba(2,6,23,0.38)';
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

      // Chrome bar
      ctx.fillStyle = frameTheme.shell;
      roundedRect(ctx, frameX, frameY, frameW, urlBarHeight, Math.max(6, radius - 2));
      ctx.fill();

      const dotY = frameY + 20;
      ['#fb7185', '#facc15', '#4ade80'].forEach((color, i) => {
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

      bodyX = frameX;
      bodyY = frameY + urlBarHeight;
      bodyW = frameW;
      bodyH = frameH - urlBarHeight;

      clipBody = () => {
        ctx.beginPath();
        ctx.moveTo(bodyX, bodyY);
        ctx.lineTo(bodyX + bodyW, bodyY);
        ctx.lineTo(bodyX + bodyW, bodyY + bodyH - rr);
        ctx.quadraticCurveTo(bodyX + bodyW, bodyY + bodyH, bodyX + bodyW - rr, bodyY + bodyH);
        ctx.lineTo(bodyX + rr, bodyY + bodyH);
        ctx.quadraticCurveTo(bodyX, bodyY + bodyH, bodyX, bodyY + bodyH - rr);
        ctx.lineTo(bodyX, bodyY);
        ctx.closePath();
      };

      // Body background
      ctx.fillStyle = frameTheme.pageBg;
      clipBody();
      ctx.fill();
    }

    // --- Draw snapshot (uses cached snapshot or auto-loads one during export) ---
    let drewSnapshot = false;
    let snapshot = snapshotCacheRef.current?.url === normalizedUrl ? snapshotCacheRef.current.bitmap : null;
    if (!snapshot) {
      setStatus(`Loading snapshot for ${normalizedUrl} before export…`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        snapshot = await loadSnapshotWithFallbacks(normalizedUrl, controller.signal);
        snapshotCacheRef.current = { url: normalizedUrl, bitmap: snapshot };
      } catch {
        // keep fallback placeholder behavior if all providers fail
      } finally {
        clearTimeout(timeout);
      }
    }
    if (snapshot) {
      const snapshotRatio = snapshot.width / snapshot.height;
      const drawW = bodyW;
      const drawH = bodyW / snapshotRatio;

      ctx.save();
      clipBody();
      ctx.clip();
      ctx.drawImage(snapshot, bodyX, bodyY, drawW, drawH);
      ctx.restore();
      drewSnapshot = true;
    }

    // Overlays drawn after the snapshot (Dynamic Island, Home Indicator)
    postSnapshotDraw();

    if (!drewSnapshot) {
      ctx.fillStyle = frameTheme.placeholderTitle;
      ctx.font = `600 ${Math.max(16, Math.floor(bodyW / 28))}px Inter, system-ui, sans-serif`;
      ctx.fillText('Export-ready browser frame', bodyX + 24, bodyY + 56);
      ctx.fillStyle = frameTheme.placeholderText;
      ctx.font = `${Math.max(13, Math.floor(bodyW / 42))}px Inter, system-ui, sans-serif`;
      ctx.fillText(`URL: ${normalizedUrl}`, bodyX + 24, bodyY + 88);
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

  // Compute iPhone preview bezel sizes in preview pixels
  const phonePrevScale = isPhone ? previewLayout.frameWidth / (state.browserWidth + PHONE_BEZELS.side * 2) : 1;
  const phonePrevSide = PHONE_BEZELS.side * phonePrevScale;
  const phonePrevTop = PHONE_BEZELS.top * phonePrevScale;
  const phonePrevBottom = PHONE_BEZELS.bottom * phonePrevScale;
  const phonePrevScreenW = previewLayout.frameWidth - phonePrevSide * 2;
  const phonePrevScreenH = previewLayout.frameHeight - phonePrevTop - phonePrevBottom;
  const phonePrevBodyRad = Math.min(44 * phonePrevScale, previewLayout.frameWidth / 4);
  const phonePrevScreenRad = Math.min(38 * phonePrevScale, phonePrevScreenW / 4);
  const phonePrevDiH = Math.max(5, 11 * phonePrevScale);

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
            <NumberField label={isPhone ? 'Screen W' : 'Browser W'} value={state.browserWidth} onChange={(v) => setField('browserWidth', v)} />
            <NumberField label={isPhone ? 'Screen H' : 'Browser H'} value={state.browserHeight} onChange={(v) => setField('browserHeight', v)} />
          </TwoCols>

          <TwoCols>
            <NumberField label="Padding" value={state.padding} onChange={(v) => setField('padding', v)} />
            {!isPhone && <NumberField label="Radius" value={state.radius} onChange={(v) => setField('radius', v)} />}
          </TwoCols>
          <NumberField label="Shadow blur" value={state.shadow} onChange={(v) => setField('shadow', v)} />

          <Control label="Page zoom (preview)">
            <div className="flex items-center gap-3">
              <input type="range" min={0.1} max={2} step={0.05} value={state.zoom} className="w-full" onChange={(e) => setField('zoom', Number(e.target.value))} />
              <span className="w-14 text-right font-mono text-sm">{state.zoom.toFixed(2)}x</span>
            </div>
          </Control>

          <Control label="Frame style">
            <select className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.frameStyle} onChange={(e) => handleFrameStyle(e.target.value)}>
              <option value="mac-dark">Mac Dark</option>
              <option value="mac-light">Mac Light</option>
              <option value="iphone-dark">iPhone Dark</option>
              <option value="iphone-light">iPhone Light</option>
            </select>
            {!isPhone && (
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={state.showUrlBar} onChange={(e) => setField('showUrlBar', e.target.checked)} /> Show URL bar
              </label>
            )}
            {isPhone && (
              <p className="mt-2 text-xs text-slate-400">
                Screen W/H sets the mobile viewport (390×844 = iPhone 14/15). Use "Instagram Story" preset for portrait canvas.
              </p>
            )}
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
            <p className="mt-2 text-xs text-slate-400">Export auto-loads live snapshot; “Load” prefetches/cache it for faster download.</p>
          </Control>

          <p className="text-sm text-slate-300">{status}</p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3" style={getBgStyle(state)}>
          <div ref={viewportRef} className="h-[75vh] min-h-[420px] w-full flex items-center justify-center">
            <div className="relative" style={{ width: `${previewLayout.canvasWidth}px`, height: `${previewLayout.canvasHeight}px` }}>

              {isPhone ? (
                // ---- iPhone frame preview ----
                <div
                  className="absolute"
                  style={{
                    left: `${previewLayout.frameOffsetX}px`,
                    top: `${previewLayout.frameOffsetY}px`,
                    width: `${previewLayout.frameWidth}px`,
                    height: `${previewLayout.frameHeight}px`,
                    borderRadius: `${phonePrevBodyRad}px`,
                    boxShadow: `0 ${Math.round(state.shadow / 6)}px ${state.shadow}px rgba(2,6,23,0.45)`,
                    backgroundColor: frameTheme.shell,
                    border: `1.5px solid ${frameTheme.border}`
                  }}
                >
                  {/* Screen background & Status Bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${phonePrevSide}px`,
                      top: `${phonePrevTop}px`,
                      width: `${phonePrevScreenW}px`,
                      height: `${phonePrevScreenH}px`,
                      borderRadius: `${phonePrevScreenRad}px`,
                      overflow: 'hidden',
                      backgroundColor: frameTheme.pageBg
                    }}
                  >
                    {/* Status Bar Fill */}
                    <div
                      style={{
                        width: '100%',
                        height: `${phonePrevDiH * 2}px`,
                        backgroundColor: frameTheme.topFill,
                        position: 'relative',
                        zIndex: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `0 ${16 * phonePrevScale}px`
                      }}
                    >
                      {/* Time */}
                      <span style={{
                        color: isDark ? '#ffffff' : '#000000',
                        fontSize: `${14 * phonePrevScale}px`,
                        fontWeight: 600,
                        fontFamily: '-apple-system, sans-serif',
                        letterSpacing: '-0.5px'
                      }}>
                        9:41
                      </span>

                      {/* Dynamic Island */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: `${phonePrevScreenW * 0.3}px`,
                          height: `${phonePrevDiH}px`,
                          borderRadius: `${phonePrevDiH / 2}px`,
                          backgroundColor: '#000',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          paddingLeft: `${phonePrevDiH * 0.25}px`
                        }}
                      >
                        {/* Camera dot */}
                        <div style={{
                          width: `${phonePrevDiH * 0.4}px`,
                          height: `${phonePrevDiH * 0.4}px`,
                          borderRadius: '50%',
                          backgroundColor: '#111',
                          border: `${Math.max(1, phonePrevDiH * 0.05)}px solid #222`,
                          boxShadow: 'inset 0 0 2px rgba(255,255,255,0.2)'
                        }} />
                      </div>

                      {/* Icons */}
                      <div style={{ display: 'flex', gap: `${4 * phonePrevScale}px`, alignItems: 'center' }}>
                        {/* WiFi icon simple representation */}
                        <svg width={`${14 * phonePrevScale}`} height={`${10 * phonePrevScale}`} viewBox="0 0 14 10" fill={isDark ? '#fff' : '#000'}>
                          <path d="M7 10C8.10457 10 9 9.10457 9 8C9 6.89543 8.10457 6 7 6C5.89543 6 5 6.89543 5 8C5 9.10457 5.89543 10 7 10Z" />
                          <path d="M3.46447 4.53553C5.41709 2.58291 8.58291 2.58291 10.5355 4.53553L11.9497 3.12132C9.21573 0.387302 4.78427 0.387302 2.05025 3.12132L3.46447 4.53553Z" />
                        </svg>
                        {/* Battery icon */}
                        <svg width={`${22 * phonePrevScale}`} height={`${10 * phonePrevScale}`} viewBox="0 0 22 10" fill="none" stroke={isDark ? '#fff' : '#000'}>
                          <rect x="0.5" y="0.5" width="18" height="9" rx="2.5" strokeWidth="1"/>
                          <rect x="2" y="2" width="12" height="6" rx="1" fill={isDark ? '#fff' : '#000'} stroke="none"/>
                          <path d="M20 3.5C21 3.5 21.5 4 21.5 5C21.5 6 21 6.5 20 6.5" strokeWidth="1"/>
                        </svg>
                      </div>
                    </div>

                    {/* iframe area - below the status bar */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: `calc(100% - ${phonePrevDiH * 2}px)`,
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          width: `${state.browserWidth / state.zoom}px`,
                          height: `${(state.browserHeight - phonePrevDiH * 2 / phonePrevScale) / state.zoom}px`,
                          transform: `scale(${(phonePrevScreenW / state.browserWidth) * state.zoom})`,
                          transformOrigin: 'top left'
                        }}
                      >
                        <iframe
                          key={`${state.url}|${state.browserWidth}x${state.browserHeight}`}
                          title="Live site preview"
                          src={normalizedUrl || 'about:blank'}
                          style={{ width: '100%', height: '100%', border: 0 }}
                          loading="eager"
                          referrerPolicy="no-referrer"
                          sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                // ---- Mac browser frame preview ----
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
                  <div style={{ position: 'relative', height: state.showUrlBar ? 'calc(100% - 52px)' : 'calc(100% - 34px)', backgroundColor: frameTheme.pageBg, overflow: 'hidden', borderBottomLeftRadius: `${state.radius}px`, borderBottomRightRadius: `${state.radius}px` }}>
                    <div style={{
                      width: `${state.browserWidth / state.zoom}px`,
                      height: `${(state.browserHeight - (state.showUrlBar ? 52 : 34)) / state.zoom}px`,
                      transform: `scale(${(previewLayout.frameWidth / state.browserWidth) * state.zoom})`,
                      transformOrigin: 'top left'
                    }}>
                      <iframe
                        key={`${state.url}|${state.browserWidth}x${state.browserHeight}`}
                        title="Live site preview"
                        src={normalizedUrl || 'about:blank'}
                        className="h-full w-full border-0"
                        loading="eager"
                        referrerPolicy="no-referrer"
                        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts"
                      />
                    </div>
                  </div>
                </div>
              )}

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
