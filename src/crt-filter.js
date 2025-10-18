(function (global) {
  const defaultParams = {
    pixelPitchCSS: 2,
    stripeGap: 0.12,
    subGap: 0.04,
    bulgeK: 0.08,
    glowStrength: 0.55,
    glowBlurPxCSS: 0.7,
    glowGain: 1.25,
    maxDPR: 2,
  };

  const state = {
    params: { ...defaultParams },
    source: null,
    wrap: null,
    scene: null,
    sub: null,
    warp: null,
    fx: null,
    sctx: null,
    bctx: null,
    wctx: null,
    fctx: null,
    glowCanvas: null,
    glowCtx: null,
    tmpCanvas: null,
    tmpCtx: null,
    dpr: 1,
    enabled: false,
    initialized: false,
    rafId: 0,
    pendingEnabled: true,
    resizeHandler: null,
    sourceVisibility: '',
  };

  function getElement(value, fallbackId) {
    if (!value) {
      return typeof fallbackId === 'string' ? document.getElementById(fallbackId) : null;
    }
    if (value instanceof HTMLElement || value instanceof HTMLCanvasElement) {
      return value;
    }
    if (typeof value === 'string') {
      return document.getElementById(value) || document.querySelector(value);
    }
    return null;
  }

  function cancelLoop() {
    if (state.rafId) {
      global.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }

  function fitCanvas(canvas) {
    if (!canvas || !state.wrap) return;
    const rect = state.wrap.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width * state.dpr));
    const height = Math.max(1, Math.floor(rect.height * state.dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawSourceToScene() {
    if (!state.scene || !state.source || !state.sctx) return;
    const { scene, source, sctx } = state;
    if (!scene.width || !scene.height || !source.width || !source.height) return;
    sctx.save();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, scene.width, scene.height);
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, scene.width, scene.height);
    sctx.restore();
  }

  function renderSubpixels() {
    const { sub, scene, bctx, sctx, params } = state;
    if (!sub || !scene || !bctx || !sctx) return;
    const W = sub.width;
    const H = sub.height;
    if (!W || !H) return;

    const pitch = Math.max(3, Math.round(params.pixelPitchCSS * state.dpr));
    const cols = Math.floor(W / pitch);
    const rows = Math.floor(H / pitch);
    const ox = Math.floor((W - cols * pitch) / 2);
    const oy = Math.floor((H - rows * pitch) / 2);

    const src = sctx.getImageData(0, 0, W, H).data;

    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, W, H);
    bctx.fillStyle = '#000';
    bctx.fillRect(0, 0, W, H);
    bctx.globalCompositeOperation = 'lighter';
    bctx.imageSmoothingEnabled = false;

    const gap = Math.max(0, Math.floor(pitch * params.stripeGap));
    const sgap = Math.max(0, Math.floor(pitch * params.subGap));
    const usableW = pitch - 2 * gap - 2 * sgap;
    const sw = Math.max(1, Math.floor(usableW / 3));
    const sh = Math.max(1, pitch - 2 * gap);
    const rad = Math.max(1, Math.floor(sw * 0.45));

    for (let j = 0; j < rows; j += 1) {
      const y = oy + j * pitch;
      const sy = Math.min(H - 1, y + (pitch >> 1));
      for (let i = 0; i < cols; i += 1) {
        const x = ox + i * pitch;
        const sx = Math.min(W - 1, x + (pitch >> 1));
        const idx = (sy * W + sx) * 4;
        const r = src[idx];
        const g = src[idx + 1];
        const b = src[idx + 2];

        bctx.globalAlpha = r / 255;
        bctx.fillStyle = 'rgb(255,0,0)';
        roundRectFast(bctx, x + gap, y + gap, sw, sh, rad);
        bctx.fill();

        bctx.globalAlpha = g / 255;
        bctx.fillStyle = 'rgb(0,255,0)';
        roundRectFast(bctx, x + gap + sw + sgap, y + gap, sw, sh, rad);
        bctx.fill();

        bctx.globalAlpha = b / 255;
        bctx.fillStyle = 'rgb(0,0,255)';
        roundRectFast(bctx, x + gap + 2 * (sw + sgap), y + gap, sw, sh, rad);
        bctx.fill();
      }
    }

    bctx.restore();
  }

  function roundRectFast(ctx, x, y, w, h, r) {
    if (r <= 1) {
      ctx.fillRect(x, y, w, h);
      return;
    }
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
  }

  function ensureTmpCanvasSize(width, height) {
    if (!state.tmpCanvas || !state.tmpCtx) return;
    if (state.tmpCanvas.width !== width || state.tmpCanvas.height !== height) {
      state.tmpCanvas.width = width;
      state.tmpCanvas.height = height;
    }
  }

  function bulgeWarp() {
    const { warp, sub, bctx, wctx, glowCanvas, glowCtx, tmpCanvas, tmpCtx, params } = state;
    if (!warp || !sub || !bctx || !wctx || !glowCanvas || !glowCtx || !tmpCanvas || !tmpCtx) return;
    const W = warp.width;
    const H = warp.height;
    if (!W || !H) return;
    const K = params.bulgeK;

    if (params.glowStrength > 0) {
      glowCanvas.width = W;
      glowCanvas.height = H;
      glowCtx.setTransform(1, 0, 0, 1, 0, 0);
      glowCtx.clearRect(0, 0, W, H);
      const blurPx = Math.max(0.1, params.glowBlurPxCSS * state.dpr);
      glowCtx.filter = `blur(${blurPx}px) brightness(${params.glowGain})`;
      glowCtx.drawImage(sub, 0, 0);

      bctx.save();
      bctx.globalCompositeOperation = 'lighter';
      bctx.globalAlpha = params.glowStrength;
      bctx.drawImage(glowCanvas, 0, 0);
      bctx.restore();
    }

    ensureTmpCanvasSize(W, H);
    tmpCtx.imageSmoothingEnabled = true;
    tmpCtx.imageSmoothingQuality = 'high';
    tmpCtx.setTransform(1, 0, 0, 1, 0, 0);
    tmpCtx.clearRect(0, 0, W, H);

    for (let y = 0; y < H; y += 1) {
      const v = (y / (H - 1)) * 2 - 1;
      const scale = 1 + K * (1 - v * v);
      const dw = W * scale;
      const dx = (W - dw) / 2;
      tmpCtx.drawImage(sub, 0, y, W, 1, dx, y, dw, 1);
    }

    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, W, H);
    wctx.imageSmoothingEnabled = true;
    wctx.imageSmoothingQuality = 'high';

    for (let x = 0; x < W; x += 1) {
      const u = (x / (W - 1)) * 2 - 1;
      const scale = 1 + K * (1 - u * u);
      const dh = H * scale;
      const dy = (H - dh) / 2;
      wctx.drawImage(tmpCanvas, x, 0, 1, H, x, dy, 1, dh);
    }
  }

  function renderNoise() {
    const { fx, fctx } = state;
    if (!fx || !fctx) return;
    const W = fx.width;
    const H = fx.height;
    if (!W || !H) return;

    const img = fctx.createImageData(W, H);
    const data = img.data;
    for (let i = 0; i < data.length; i += 16) {
      const v = 128 + ((Math.random() * 70 - 35) | 0);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = (Math.random() * 40) | 0;
    }
    fctx.putImageData(img, 0, 0);

    fx.style.opacity = (0.12 + Math.random() * 0.06).toFixed(3);
  }

  function step() {
    state.rafId = 0;
    if (!state.enabled) return;
    drawSourceToScene();
    renderSubpixels();
    bulgeWarp();
    renderNoise();
    state.rafId = global.requestAnimationFrame(step);
  }

  function startLoop() {
    if (state.rafId || !state.enabled) return;
    state.rafId = global.requestAnimationFrame(step);
  }

  function resize() {
    if (!state.initialized) return;
    state.dpr = Math.max(1, Math.min(state.params.maxDPR, global.devicePixelRatio || 1));
    fitCanvas(state.scene);
    fitCanvas(state.sub);
    fitCanvas(state.warp);
    fitCanvas(state.fx);
    ensureTmpCanvasSize(state.warp ? state.warp.width : 0, state.warp ? state.warp.height : 0);
    if (!state.enabled) return;
    drawSourceToScene();
    renderSubpixels();
    bulgeWarp();
  }

  function setEnabled(value) {
    state.pendingEnabled = !!value;
    if (!state.initialized) {
      return state.pendingEnabled;
    }
    const next = state.pendingEnabled;
    if (state.enabled === next) {
      return state.enabled;
    }
    state.enabled = next;

    if (state.wrap) {
      state.wrap.style.display = next ? 'block' : 'none';
    }
    if (state.source) {
      if (next) {
        state.sourceVisibility = state.sourceVisibility || state.source.style.visibility || '';
        state.source.style.visibility = 'hidden';
      } else {
        state.source.style.visibility = state.sourceVisibility;
      }
    }

    if (!next) {
      cancelLoop();
      if (state.wctx && state.warp) {
        state.wctx.clearRect(0, 0, state.warp.width, state.warp.height);
      }
      if (state.fctx && state.fx) {
        state.fctx.clearRect(0, 0, state.fx.width, state.fx.height);
        state.fx.style.opacity = '0';
      }
      return state.enabled;
    }

    resize();
    startLoop();
    return state.enabled;
  }

  function init(options = {}) {
    if (state.initialized) {
      if (options && Object.prototype.hasOwnProperty.call(options, 'enabled')) {
        setEnabled(options.enabled);
      }
      return true;
    }

    const wrap = getElement(options.wrap, 'crtFilterWrap');
    const source = getElement(options.source, 'outrun');
    const scene = getElement(options.scene, 'crtScene');
    const sub = getElement(options.sub, 'crtSub');
    const warp = getElement(options.warp, 'crtWarp');
    const fx = getElement(options.fx, 'crtFx');

    if (!wrap || !source || !scene || !sub || !warp || !fx) {
      console.warn('CrtFilter.init skipped: missing required canvas elements');
      return false;
    }

    const sctx = scene.getContext('2d');
    const bctx = sub.getContext('2d');
    const wctx = warp.getContext('2d');
    const fctx = fx.getContext('2d', { alpha: true });

    if (!sctx || !bctx || !wctx || !fctx) {
      console.warn('CrtFilter.init skipped: unable to obtain rendering contexts');
      return false;
    }

    state.wrap = wrap;
    state.source = source;
    state.scene = scene;
    state.sub = sub;
    state.warp = warp;
    state.fx = fx;
    state.sctx = sctx;
    state.bctx = bctx;
    state.wctx = wctx;
    state.fctx = fctx;
    state.glowCanvas = document.createElement('canvas');
    state.glowCtx = state.glowCanvas.getContext('2d');
    state.tmpCanvas = document.createElement('canvas');
    state.tmpCtx = state.tmpCanvas.getContext('2d');
    state.sourceVisibility = source.style.visibility || '';

    if (!state.glowCtx || !state.tmpCtx) {
      console.warn('CrtFilter.init skipped: unable to allocate auxiliary canvases');
      return false;
    }

    state.bctx.imageSmoothingEnabled = false;
    state.sctx.imageSmoothingEnabled = false;

    state.resizeHandler = () => resize();
    global.addEventListener('resize', state.resizeHandler, { passive: true });

    state.initialized = true;
    state.wrap.style.display = 'none';

    const startEnabled = Object.prototype.hasOwnProperty.call(options, 'enabled')
      ? !!options.enabled
      : state.pendingEnabled;
    state.pendingEnabled = startEnabled;

    resize();
    setEnabled(startEnabled);
    return true;
  }

  function isEnabled() {
    return !!state.enabled;
  }

  function teardown() {
    cancelLoop();
    if (state.resizeHandler) {
      global.removeEventListener('resize', state.resizeHandler);
    }
    if (state.source) {
      state.source.style.visibility = state.sourceVisibility;
    }
    state.initialized = false;
  }

  global.CrtFilter = {
    init,
    setEnabled,
    isEnabled,
    resize,
    teardown,
  };
})(window);
