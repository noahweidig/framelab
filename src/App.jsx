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

function getBgStyle(state) {
  if (state.mode === 'solid') {
    return { background: state.bgSolid };
  }
  const stops = state.gradientStops === 3
    ? `${state.bgA} 0%, ${state.bgB} 50%, ${state.bgC} 100%`
    : `${state.bgA} 0%, ${state.bgB} 100%`;
  return { background: `linear-gradient(${state.gradientAngle}deg, ${stops})` };
}

function App() {
  const [state, setState] = useState(parseUrlState);
  const [status, setStatus] = useState('Live preview enabled. Resize your browser to see it adapt.');
  const [error, setError] = useState('');
  const [frameSize, setFrameSize] = useState({ width: state.browserWidth, height: state.browserHeight });
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
      const ratio = state.browserWidth / state.browserHeight;

      let width = Math.min(maxW, state.browserWidth);
      let height = width / ratio;
      if (height > maxH) {
        height = maxH;
        width = height * ratio;
      }

      setFrameSize({ width, height });
    };

    updateFrameSize();

    const observer = new ResizeObserver(updateFrameSize);
    if (viewportRef.current) observer.observe(viewportRef.current);
    window.addEventListener('resize', updateFrameSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateFrameSize);
    };
  }, [state.browserWidth, state.browserHeight]);

  const frameTheme = useMemo(() => {
    const dark = state.frameStyle.includes('dark');
    return {
      shell: dark ? '#1f2937' : '#e2e8f0',
      pageBg: dark ? '#0b1120' : '#ffffff',
      urlPill: dark ? '#374151' : '#ffffff',
      urlText: dark ? '#9ca3af' : '#64748b',
      border: dark ? '1px solid #0f172a' : '1px solid #cbd5e1'
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
    setStatus(`Live page loaded: ${state.url}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-3 md:px-6">
        <h1 className="text-xl font-semibold">FrameLab</h1>
        <p className="text-sm text-slate-400">Live browser-frame previews that auto-resize with the window.</p>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 md:grid-cols-[390px_1fr] md:p-6">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <Control label="Website URL">
            <div className="flex gap-2">
              <input className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2" value={state.url} onChange={(e) => setField('url', e.target.value)} />
              <button className="rounded-lg bg-indigo-500 px-3 text-sm font-medium hover:bg-indigo-400" onClick={applyUrl}>
                Load
              </button>
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

          <p className="text-sm text-slate-300">{status}</p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3" style={getBgStyle(state)}>
          <div ref={viewportRef} className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg p-3">
            <div
              className="mx-auto overflow-hidden"
              style={{
                width: `${frameSize.width}px`,
                height: `${frameSize.height}px`,
                borderRadius: `${state.radius}px`,
                boxShadow: `0 ${Math.round(state.shadow / 6)}px ${state.shadow}px rgba(2, 6, 23, 0.38)`,
                backgroundColor: frameTheme.shell,
                border: frameTheme.border
              }}
            >
              <div
                style={{
                  height: state.showUrlBar ? '52px' : '34px',
                  backgroundColor: frameTheme.shell,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 16px',
                  gap: '12px'
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                </div>
                {state.showUrlBar && (
                  <div
                    className="truncate rounded-md px-3 py-1 text-sm"
                    style={{
                      width: '100%',
                      backgroundColor: frameTheme.urlPill,
                      color: frameTheme.urlText
                    }}
                  >
                    {state.url.replace(/^https?:\/\//, '')}
                  </div>
                )}
              </div>
              <div style={{ height: state.showUrlBar ? 'calc(100% - 52px)' : 'calc(100% - 34px)', backgroundColor: frameTheme.pageBg }}>
                <iframe
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

export default App;
