(function (global) {
  const { Gameplay, AppScreens, Config, World } = global;

  if (!Gameplay || !AppScreens || !Config || !World) {
    throw new Error('App module requires Gameplay, AppScreens, Config, and World globals');
  }

  const mainMenuOptions = [
    { key: 'start', label: 'Start Race' },
    { key: 'leaderboard', label: 'Leaderboard' },
    { key: 'settings', label: 'Settings' },
  ];

  const pauseMenuOptions = [
    { key: 'resume', label: 'Resume' },
    { key: 'quit', label: 'Quit to Menu' },
  ];

  const vehicleOptions = [
    {
      key: 'car',
      label: 'Sports Car',
      description: 'Lightweight racer built for speed.',
      atlasTextureKey: 'playerCar',
      previewPath: 'tex/player-select-car.png',
      previewAtlas: { columns: 9, rows: 9, frameCount: 81, frameRate: 24 },
    },
    {
      key: 'van',
      label: 'Turbo Van',
      description: 'Sturdy ride with room to spare.',
      atlasTextureKey: 'playerVan',
      previewPath: 'tex/player-select-van.png',
      previewAtlas: { columns: 9, rows: 9, frameCount: 81, frameRate: 24 },
    },
  ];

  const settingsMenuKeys = ['snow', 'back'];
  const IDLE_TIMEOUT_MS = 5000;
  const DEFAULT_VEHICLE_PREVIEW_FRAME_DURATION = 1 / 24;
  const LOCAL_STORAGE_KEY = 'outrun_leaderboard_v1';

  const DEFAULT_LEADERBOARD_ENTRIES = [
    { name: 'ACE', score: 19821, date: '2024-03-18' },
    { name: 'BLZ', score: 19450, date: '2024-03-12' },
    { name: 'CRN', score: 110345, date: '2024-03-21' },
    { name: 'DRT', score: 18760, date: '2024-03-05' },
    { name: 'EVR', score: 111220, date: '2024-04-02' },
    { name: 'FLX', score: 19105, date: '2024-03-29' },
    { name: 'GLO', score: 112440, date: '2024-04-10' },
    { name: 'HRZ', score: 19950, date: '2024-03-25' },
    { name: 'ION', score: 18835, date: '2024-02-27' },
    { name: 'JYN', score: 110780, date: '2024-04-07' },
  ];

  const state = {
    mode: 'menu',
    mainMenuIndex: 0,
    pauseMenuIndex: 0,
    settingsMenuIndex: 0,
    vehicleSelectIndex: 0,
    selectedVehicleKey: vehicleOptions.length ? vehicleOptions[0].key : null,
    settings: { snowEnabled: true, debugEnabled: false },
    lastInteractionAt: Date.now(),
    leaderboard: {
      loading: false,
      error: null,
      entries: [],
      highlightId: null,
    },
    raceComplete: createInitialRaceCompleteState(),
    dom: {
      menuLayer: null,
      menuPanel: null,
      attractVideo: null,
      vehiclePreview: null,
    },
  };

  const NAME_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function createInitialRaceCompleteState() {
    return {
      active: false,
      timeMs: 0,
      letters: ['A', 'A', 'A'],
      confirmed: [false, false, false],
      currentIndex: 0,
      phase: 'idle',
      timer: 0,
      entryId: null,
      playerName: 'AAA',
      playerRank: null,
    };
  }

  function resetRaceCompleteState() {
    state.raceComplete = createInitialRaceCompleteState();
  }

  function now() {
    return Date.now();
  }

  function markInteraction() {
    state.lastInteractionAt = now();
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveAssetUrlSafe(path) {
    if (!path) return '';
    try {
      if (World && typeof World.resolveAssetUrl === 'function') {
        return World.resolveAssetUrl(path);
      }
    } catch (err) {
      return path;
    }
    return path;
  }

  function normalizePreviewAtlas(raw = null) {
    if (!raw || typeof raw !== 'object') return null;
    const rawColumns = Number(raw.columns);
    const rawRows = Number(raw.rows);
    const rawFrameCount = Number(raw.frameCount);
    const rawFrameRate = Number(raw.frameRate);
    const rawFrameDuration = Number(raw.frameDuration);

    let columns = Number.isFinite(rawColumns) && rawColumns > 0 ? Math.round(rawColumns) : null;
    let rows = Number.isFinite(rawRows) && rawRows > 0 ? Math.round(rawRows) : null;
    let frameCount = Number.isFinite(rawFrameCount) && rawFrameCount > 0 ? Math.round(rawFrameCount) : null;
    let frameDuration = Number.isFinite(rawFrameDuration) && rawFrameDuration > 0
      ? rawFrameDuration
      : null;

    if (!frameDuration && Number.isFinite(rawFrameRate) && rawFrameRate > 0) {
      frameDuration = 1 / rawFrameRate;
    }

    if (!columns && rows && frameCount) {
      columns = Math.max(1, Math.ceil(frameCount / rows));
    }
    if (!rows && columns && frameCount) {
      rows = Math.max(1, Math.ceil(frameCount / columns));
    }
    if (!frameCount && columns && rows) {
      frameCount = columns * rows;
    }

    if (!columns || !frameCount) {
      return null;
    }

    if (!rows) {
      rows = Math.max(1, Math.ceil(frameCount / columns));
    }

    const safeFrameDuration = frameDuration && frameDuration > 0
      ? frameDuration
      : DEFAULT_VEHICLE_PREVIEW_FRAME_DURATION;

    return {
      columns,
      rows,
      frameCount,
      frameDuration: safeFrameDuration,
    };
  }

  function formatTimeMs(value) {
    if (!Number.isFinite(value)) return '--';
    const safeValue = Math.max(0, Math.round(value));
    return `${safeValue.toLocaleString()} ms`;
  }

  function createLeaderboardEntry(name, scoreMs, date = '') {
    const normalized = String(name || '')
      .trim()
      .toUpperCase()
      .slice(0, 3) || '---';
    const numericScore = Number.isFinite(scoreMs) ? scoreMs : 0;
    return {
      id: Symbol('leaderboardEntry'),
      name: normalized,
      score: numericScore,
      displayValue: formatTimeMs(numericScore),
      date,
      rank: null,
    };
  }

  function recomputeLeaderboardRanks(entries = state.leaderboard.entries) {
    entries.forEach((entry, idx) => {
      if (!entry) return;
      entry.rank = idx + 1;
    });
  }

  function sortLeaderboardEntries() {
    state.leaderboard.entries.sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      if (a.score === b.score) return a.name.localeCompare(b.name);
      return a.score - b.score;
    });
    recomputeLeaderboardRanks();
  }

  function findLeaderboardEntryIndexById(id) {
    if (!id) return -1;
    return state.leaderboard.entries.findIndex((entry) => entry && entry.id === id);
  }

  function addLeaderboardEntry(name, scoreMs) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const entry = createLeaderboardEntry(name, scoreMs, dateStr);
    state.leaderboard.entries.push(entry);
    sortLeaderboardEntries();
    state.leaderboard.highlightId = entry.id;
    saveLocalEntry(entry.name, entry.score, dateStr);
    return entry;
  }

  function saveLocalEntry(name, score, date) {
    try {
      const existing = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      existing.push({ name, score, date });
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(existing));
    } catch (err) {
      console.warn('Failed to save to localStorage', err);
    }
  }

  function setMode(nextMode) {
    if (!nextMode || state.mode === nextMode) return;
    const prevMode = state.mode;
    state.mode = nextMode;
    if (nextMode === 'playing') {
      state.mainMenuIndex = 0;
      state.pauseMenuIndex = 0;
      state.settingsMenuIndex = 0;
    } else {
      markInteraction();
    }
    if (prevMode === 'raceComplete' && nextMode !== 'raceComplete') {
      resetRaceCompleteState();
    }
    updateMenuLayer();
  }

  function ensureDom() {
    if (state.dom.menuLayer && state.dom.menuPanel) return;
    const menuLayer = document.getElementById('appMenuLayer');
    if (!menuLayer) {
      throw new Error('Missing #appMenuLayer element');
    }
    const menuPanel = menuLayer.querySelector('.menu-panel');
    if (!menuPanel) {
      throw new Error('Missing .menu-panel element inside #appMenuLayer');
    }
    state.dom.menuLayer = menuLayer;
    state.dom.menuPanel = menuPanel;
  }

  function renderMainMenu() {
    if (!AppScreens.mainMenu) return '';
    return AppScreens.mainMenu(
      {
        title: 'Outrun',
        subtitle: 'Neon Grand Prix',
        options: mainMenuOptions,
        selectedIndex: state.mainMenuIndex,
      },
      { escapeHtml },
    );
  }

  function renderLeaderboard() {
    if (!AppScreens.leaderboard) return '';
    const { loading, error, entries, highlightId } = state.leaderboard;
    const topEntries = entries
      .slice(0, Math.min(10, entries.length))
      .map((entry) => {
        if (!entry) {
          return { rank: '', name: '', score: '', isHighlight: false };
        }
        return {
          rank: entry.rank,
          name: entry.name,
          score: entry.displayValue,
          isHighlight: highlightId && entry.id === highlightId,
        };
      });

    return AppScreens.leaderboard(
      {
        loading,
        error,
        entries: topEntries,
      },
      { escapeHtml },
    );
  }

  function renderSettings() {
    if (!AppScreens.settingsMenu) return '';
    const options = [
      {
        key: 'snow',
        label: 'Snow Effects',
        value: state.settings.snowEnabled ? 'ON' : 'OFF',
      },
      {
        key: 'back',
        label: 'Back',
      },
    ];

    return AppScreens.settingsMenu(
      {
        options,
        selectedIndex: state.settingsMenuIndex,
      },
      { escapeHtml },
    );
  }

  function renderPauseMenu() {
    if (!AppScreens.pauseMenu) return '';
    return AppScreens.pauseMenu(
      {
        options: pauseMenuOptions,
        selectedIndex: state.pauseMenuIndex,
      },
      { escapeHtml },
    );
  }

  function renderVehicleSelect() {
    if (!AppScreens.vehicleSelect) return '';
    const total = vehicleOptions.length;
    const index = clampIndex(state.vehicleSelectIndex, total);
    const option = vehicleOptions[index] || vehicleOptions[0] || {};

    return AppScreens.vehicleSelect(
      {
        title: 'Select Vehicle',
        vehicleLabel: option.label || '',
        vehicleDescription: option.description || '',
        optionIndex: index,
        optionCount: total,
        previewSrc: option.previewPath || '',
        previewAtlas: normalizePreviewAtlas(option.previewAtlas),
      },
      { escapeHtml, resolveAssetUrl: resolveAssetUrlSafe },
    );
  }

  function renderAttract() {
    if (!AppScreens.attract) return '';
    return AppScreens.attract({ videoSrc: 'video/attract-loop.mp4' });
  }

  function renderRaceComplete() {
    if (!AppScreens.raceComplete) return '';
    const rc = state.raceComplete;
    const timeLabel = formatTimeMs(rc.timeMs);

    return AppScreens.raceComplete(
      {
        active: rc.active,
        phase: rc.phase,
        timeLabel,
        letters: rc.letters,
        confirmed: rc.confirmed,
        currentIndex: rc.currentIndex,
        playerRank: rc.playerRank,
      },
      { escapeHtml },
    );
  }

  function startAttractPlayback(video) {
    if (!video) return;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  function stopAttractPlayback() {
    if (state.dom.attractVideo) {
      try {
        state.dom.attractVideo.pause();
      } catch (err) {
        // ignore
      }
      state.dom.attractVideo.currentTime = 0;
    }
  }

  function updateMenuLayer() {
    ensureDom();
    const { menuLayer, menuPanel } = state.dom;
    if (!menuLayer || !menuPanel) return;
    const menuVisible = state.mode !== 'playing';
    menuLayer.classList.toggle('is-hidden', !menuVisible);
    menuLayer.dataset.mode = state.mode;
    menuPanel.dataset.mode = state.mode;

    let html = '';
    if (state.mode === 'menu') {
      html = renderMainMenu();
    } else if (state.mode === 'leaderboard') {
      html = renderLeaderboard();
    } else if (state.mode === 'settings') {
      html = renderSettings();
    } else if (state.mode === 'paused') {
      html = renderPauseMenu();
    } else if (state.mode === 'vehicleSelect') {
      html = renderVehicleSelect();
    } else if (state.mode === 'attract') {
      html = renderAttract();
    } else if (state.mode === 'raceComplete') {
      html = renderRaceComplete();
    } else {
      html = '';
    }
    menuPanel.innerHTML = html;

    setupVehiclePreviewAnimation();

    if (state.mode === 'attract') {
      const video = menuPanel.querySelector('#appAttractVideo');
      state.dom.attractVideo = video || null;
      if (video) {
        startAttractPlayback(video);
      }
    } else {
      stopAttractPlayback();
      state.dom.attractVideo = null;
    }
  }

  function applyVehiclePreviewFrame(preview) {
    if (!preview || !preview.element) return;
    const { element, columns, rows, frameCount } = preview;
    const safeFrameCount = Math.max(1, frameCount | 0);
    const frame = ((preview.frameIndex % safeFrameCount) + safeFrameCount) % safeFrameCount;
    const col = columns > 0 ? frame % columns : 0;
    const row = columns > 0 ? Math.floor(frame / columns) : 0;
    const xPercent = columns <= 1 ? 0 : (col / Math.max(1, columns - 1)) * 100;
    const yPercent = rows <= 1 ? 0 : (row / Math.max(1, rows - 1)) * 100;
    element.style.backgroundPosition = `${xPercent}% ${yPercent}%`;
  }

  function setupVehiclePreviewAnimation() {
    const { menuPanel } = state.dom;
    if (!menuPanel || state.mode !== 'vehicleSelect') {
      state.dom.vehiclePreview = null;
      return;
    }

    const el = menuPanel.querySelector('.vehicle-select-image[data-vehicle-preview]');
    if (!el) {
      state.dom.vehiclePreview = null;
      return;
    }

    const columnsRaw = Number.parseInt(el.getAttribute('data-columns') || '', 10);
    const rowsRaw = Number.parseInt(el.getAttribute('data-rows') || '', 10);
    const frameCountRaw = Number.parseInt(el.getAttribute('data-frame-count') || '', 10);
    const frameDurationRaw = Number.parseFloat(el.getAttribute('data-frame-duration') || '');

    const columns = Number.isFinite(columnsRaw) && columnsRaw > 0 ? columnsRaw : 1;
    const rows = Number.isFinite(rowsRaw) && rowsRaw > 0 ? rowsRaw : 1;
    const frameCount = Number.isFinite(frameCountRaw) && frameCountRaw > 0
      ? frameCountRaw
      : columns * rows;
    const frameDuration = Number.isFinite(frameDurationRaw) && frameDurationRaw > 0
      ? frameDurationRaw
      : DEFAULT_VEHICLE_PREVIEW_FRAME_DURATION;

    el.style.backgroundSize = `${Math.max(1, columns) * 100}% ${Math.max(1, rows) * 100}%`;
    el.style.backgroundRepeat = 'no-repeat';

    if (frameCount <= 1) {
      state.dom.vehiclePreview = null;
      el.style.backgroundPosition = '0% 0%';
      return;
    }

    const preview = {
      element: el,
      columns: Math.max(1, columns),
      rows: Math.max(1, rows),
      frameCount: Math.max(1, frameCount),
      frameDuration: Math.max(frameDuration, 1 / 120),
      frameIndex: 0,
      accumulator: 0,
    };

    applyVehiclePreviewFrame(preview);
    state.dom.vehiclePreview = preview;
  }

  function updateVehiclePreviewAnimation(dt) {
    const preview = state.dom.vehiclePreview;
    if (!preview) return;
    if (state.mode !== 'vehicleSelect') {
      state.dom.vehiclePreview = null;
      return;
    }
    const { element } = preview;
    if (!element || !element.isConnected) {
      state.dom.vehiclePreview = null;
      return;
    }
    const frameDuration = preview.frameDuration > 0
      ? preview.frameDuration
      : DEFAULT_VEHICLE_PREVIEW_FRAME_DURATION;
    preview.accumulator += dt;
    if (preview.accumulator < frameDuration) {
      return;
    }
    const framesToAdvance = Math.max(1, Math.floor(preview.accumulator / frameDuration));
    preview.accumulator -= framesToAdvance * frameDuration;
    preview.frameIndex = (preview.frameIndex + framesToAdvance) % Math.max(1, preview.frameCount);
    applyVehiclePreviewFrame(preview);
  }

  function clampIndex(index, total) {
    if (total <= 0) return 0;
    const mod = ((index % total) + total) % total;
    return mod;
  }

  function changeMainMenuSelection(delta) {
    const total = mainMenuOptions.length;
    state.mainMenuIndex = clampIndex(state.mainMenuIndex + delta, total);
    updateMenuLayer();
  }

  function changePauseMenuSelection(delta) {
    const total = pauseMenuOptions.length;
    state.pauseMenuIndex = clampIndex(state.pauseMenuIndex + delta, total);
    updateMenuLayer();
  }

  function changeSettingsSelection(delta) {
    const total = settingsMenuKeys.length;
    state.settingsMenuIndex = clampIndex(state.settingsMenuIndex + delta, total);
    updateMenuLayer();
  }

  function changeVehicleSelection(delta) {
    const total = vehicleOptions.length;
    if (total <= 0) return;
    state.vehicleSelectIndex = clampIndex(state.vehicleSelectIndex + delta, total);
    updateMenuLayer();
  }

  function getVehicleOptionByKey(key) {
    if (!key) return null;
    return vehicleOptions.find((option) => option && option.key === key) || null;
  }

  function applyVehicleSelection(vehicleKey) {
    const option = getVehicleOptionByKey(vehicleKey) || vehicleOptions[0] || null;
    if (!option) return;
    state.selectedVehicleKey = option.key;
    const idx = vehicleOptions.findIndex((candidate) => candidate && candidate.key === option.key);
    if (idx >= 0) {
      state.vehicleSelectIndex = clampIndex(idx, vehicleOptions.length);
    }
    const textures = (World && World.assets && World.assets.textures)
      ? World.assets.textures
      : null;
    if (!textures) return;
    const atlasKey = option.atlasTextureKey;
    const atlasTexture = atlasKey && textures[atlasKey] ? textures[atlasKey] : null;
    const fallbackTexture = textures.playerCar || textures.car || null;
    if (atlasTexture || fallbackTexture) {
      textures.playerVehicle = atlasTexture || fallbackTexture;
    }
  }

  function showVehicleSelect() {
    const total = vehicleOptions.length;
    if (total <= 0) {
      startRace();
      return;
    }
    const currentIndex = vehicleOptions.findIndex((option) => option && option.key === state.selectedVehicleKey);
    if (currentIndex >= 0) {
      state.vehicleSelectIndex = clampIndex(currentIndex, total);
    } else {
      state.vehicleSelectIndex = clampIndex(state.vehicleSelectIndex, total);
    }
    setMode('vehicleSelect');
  }

  function activateVehicleSelection() {
    const total = vehicleOptions.length;
    if (total <= 0) {
      startRace();
      return;
    }
    const index = clampIndex(state.vehicleSelectIndex, total);
    const option = vehicleOptions[index];
    if (!option) return;
    startRace(option.key);
  }

  function adjustCurrentNameLetter(delta) {
    const rc = state.raceComplete;
    if (!rc.active || rc.phase !== 'entry') return;
    const index = rc.currentIndex;
    if (index < 0 || index >= rc.letters.length) return;
    if (rc.confirmed[index]) return;
    const alphabet = NAME_ALPHABET;
    const current = rc.letters[index] || 'A';
    const currentIdx = alphabet.indexOf(current);
    const base = currentIdx >= 0 ? currentIdx : 0;
    const next = ((base + delta) % alphabet.length + alphabet.length) % alphabet.length;
    rc.letters[index] = alphabet[next];
    rc.playerName = rc.letters.join('');
    updateMenuLayer();
  }

  function lockCurrentNameLetter() {
    const rc = state.raceComplete;
    if (!rc.active || rc.phase !== 'entry') return;
    const index = rc.currentIndex;
    if (index < 0 || index >= rc.letters.length) return;
    rc.confirmed[index] = true;
    rc.playerName = rc.letters.join('');
    if (index < rc.letters.length - 1) {
      rc.currentIndex = index + 1;
      updateMenuLayer();
    } else {
      finalizeRaceCompleteEntry();
    }
  }

  function finalizeRaceCompleteEntry() {
    const rc = state.raceComplete;
    rc.playerName = rc.letters.join('');
    const entry = addLeaderboardEntry(rc.playerName, rc.timeMs);
    rc.entryId = entry.id;
    rc.playerRank = entry.rank;
    setRaceCompletePhase('revealPlayer');
  }

  function setRaceCompletePhase(phase) {
    const rc = state.raceComplete;
    rc.phase = phase;
    rc.timer = 0;
    markInteraction();
    updateMenuLayer();
  }

  function advanceRaceCompleteSequence() {
    const { phase } = state.raceComplete;
    if (phase === 'revealPlayer') {
      setRaceCompletePhase('revealTop');
    } else if (phase === 'revealTop') {
      setRaceCompletePhase('complete');
    } else if (phase === 'complete') {
      goToAttract();
    }
  }

  function updateRaceComplete(dt) {
    const rc = state.raceComplete;
    if (!rc.active) return;
    if (rc.phase === 'revealPlayer' || rc.phase === 'revealTop' || rc.phase === 'complete') {
      rc.timer += dt;
      if (rc.phase === 'revealPlayer' && rc.timer >= 3) {
        setRaceCompletePhase('revealTop');
        return;
      }
      if (rc.phase === 'revealTop' && rc.timer >= 3) {
        setRaceCompletePhase('complete');
        return;
      }
      if (rc.phase === 'complete' && rc.timer >= 2.5) {
        goToAttract();
      }
    }
  }

  function goToAttract() {
    setMode('attract');
  }

  function toggleSnowSetting() {
    state.settings.snowEnabled = !state.settings.snowEnabled;
    updateMenuLayer();
  }

  function applyDebugModeSetting() {
    if (!Config || !Config.debug || typeof Config.debug !== 'object') {
      return;
    }
    try {
      Config.debug.mode = state.settings.debugEnabled ? 'fill' : 'off';
    } catch (err) {
      console.warn('Failed to update debug mode', err);
    }
  }

  function setDebugEnabled(enabled) {
    state.settings.debugEnabled = !!enabled;
    applyDebugModeSetting();
  }

  function toggleDebugSetting() {
    setDebugEnabled(!state.settings.debugEnabled);
    updateMenuLayer();
  }

  function resetGameplayInputs() {
    if (!Gameplay || !Gameplay.state || !Gameplay.state.input) return;
    const input = Gameplay.state.input;
    input.left = false;
    input.right = false;
    input.up = false;
    input.down = false;
    input.hop = false;
  }

  function startRace(vehicleKey = state.selectedVehicleKey) {
    applyVehicleSelection(vehicleKey);
    resetRaceCompleteState();
    setMode('playing');
    resetGameplayInputs();
    Promise.resolve(Gameplay.resetScene && Gameplay.resetScene())
      .then(() => {
        if (Gameplay && typeof Gameplay.startRaceSession === 'function') {
          Gameplay.startRaceSession({ laps: 1 });
        }
      })
      .catch((err) => console.error('Failed to start race', err));
  }

  function handleRaceFinish(timeMs) {
    resetGameplayInputs();
    const safeTime = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
    const rc = createInitialRaceCompleteState();
    rc.active = true;
    rc.timeMs = safeTime;
    rc.phase = 'entry';
    rc.playerName = rc.letters.join('');
    state.raceComplete = rc;
    state.leaderboard.highlightId = null;
    setMode('raceComplete');
  }

  function showLeaderboard() {
    setMode('leaderboard');
    requestLeaderboard();
  }

  function showSettings() {
    setMode('settings');
  }

  function resumeRace() {
    setMode('playing');
  }

  function quitToMenu() {
    setMode('menu');
    resetGameplayInputs();
    Promise.resolve(Gameplay.resetScene && Gameplay.resetScene())
      .catch((err) => console.error('Failed to reset scene after quitting', err));
  }

  function activateMainMenuSelection() {
    const option = mainMenuOptions[state.mainMenuIndex];
    if (!option) return;
    if (option.key === 'start') {
      showVehicleSelect();
    } else if (option.key === 'leaderboard') {
      showLeaderboard();
    } else if (option.key === 'settings') {
      showSettings();
    }
  }

  function activatePauseMenuSelection() {
    const option = pauseMenuOptions[state.pauseMenuIndex];
    if (!option) return;
    if (option.key === 'resume') {
      resumeRace();
    } else if (option.key === 'quit') {
      quitToMenu();
    }
  }

  function activateSettingsSelection() {
    const key = settingsMenuKeys[state.settingsMenuIndex];
    if (key === 'snow') {
      toggleSnowSetting();
    } else if (key === 'back') {
      setMode('menu');
    }
  }

  function requestLeaderboard() {
    if (state.leaderboard.loading || state.leaderboard.entries.length) {
      return;
    }
    state.leaderboard.loading = true;
    state.leaderboard.error = null;
    updateMenuLayer();

    // Simulate async load for UI consistency, but load from memory/localstorage
    setTimeout(() => {
      try {
        // 1. Load defaults
        const combined = [...DEFAULT_LEADERBOARD_ENTRIES];
        
        // 2. Load user saves
        const localRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localRaw) {
          const localData = JSON.parse(localRaw);
          if (Array.isArray(localData)) {
            combined.push(...localData);
          }
        }

        // 3. Convert to app objects
        state.leaderboard.entries = combined.map(d => 
          createLeaderboardEntry(d.name, d.score, d.date)
        );
        
        sortLeaderboardEntries();
        state.leaderboard.loading = false;
      } catch (err) {
        console.error('Leaderboard load failed', err);
        state.leaderboard.error = err;
        state.leaderboard.loading = false;
      }
      updateMenuLayer();
    }, 50);
  }

  function handleMenuNavigation(delta) {
    changeMainMenuSelection(delta);
  }

  function handlePauseNavigation(delta) {
    changePauseMenuSelection(delta);
  }

  function handleSettingsNavigation(delta) {
    changeSettingsSelection(delta);
  }

  function handleMenuKeyDown(e) {
    if (['ArrowUp', 'ArrowLeft'].includes(e.code)) {
      handleMenuNavigation(-1);
      e.preventDefault();
      return true;
    }
    if (['ArrowDown', 'ArrowRight'].includes(e.code)) {
      handleMenuNavigation(1);
      e.preventDefault();
      return true;
    }
    if (['Space', 'Enter'].includes(e.code)) {
      activateMainMenuSelection();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleLeaderboardKeyDown(e) {
    if (['Space', 'Enter', 'Escape'].includes(e.code)) {
      setMode('menu');
      e.preventDefault();
      return true;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleSettingsKeyDown(e) {
    if (['ArrowUp'].includes(e.code)) {
      handleSettingsNavigation(-1);
      e.preventDefault();
      return true;
    }
    if (['ArrowDown'].includes(e.code)) {
      handleSettingsNavigation(1);
      e.preventDefault();
      return true;
    }
    if (['ArrowLeft', 'ArrowRight'].includes(e.code)) {
      const key = settingsMenuKeys[state.settingsMenuIndex];
      if (key === 'snow') {
        toggleSnowSetting();
      }
      e.preventDefault();
      return true;
    }
    if (['Space', 'Enter'].includes(e.code)) {
      activateSettingsSelection();
      e.preventDefault();
      return true;
    }
    if (e.code === 'Escape') {
      setMode('menu');
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleVehicleSelectKeyDown(e) {
    if (e.code === 'ArrowLeft') {
      changeVehicleSelection(-1);
      e.preventDefault();
      return true;
    }
    if (e.code === 'ArrowRight') {
      changeVehicleSelection(1);
      e.preventDefault();
      return true;
    }
    if (['Space', 'Enter'].includes(e.code)) {
      activateVehicleSelection();
      e.preventDefault();
      return true;
    }
    if (e.code === 'Escape') {
      setMode('menu');
      e.preventDefault();
      return true;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handlePauseKeyDown(e) {
    if (['ArrowUp', 'ArrowLeft'].includes(e.code)) {
      handlePauseNavigation(-1);
      e.preventDefault();
      return true;
    }
    if (['ArrowDown', 'ArrowRight'].includes(e.code)) {
      handlePauseNavigation(1);
      e.preventDefault();
      return true;
    }
    if (['Space', 'Enter'].includes(e.code)) {
      activatePauseMenuSelection();
      e.preventDefault();
      return true;
    }
    if (e.code === 'Escape') {
      resumeRace();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleRaceCompleteKeyDown(e) {
    const rc = state.raceComplete;
    if (e.code === 'Escape') {
      goToAttract();
      e.preventDefault();
      return true;
    }
    if (!rc.active) {
      if (['Space', 'Enter'].includes(e.code)) {
        goToAttract();
        e.preventDefault();
        return true;
      }
      return false;
    }
    if (rc.phase === 'entry') {
      if (['ArrowUp'].includes(e.code)) {
        adjustCurrentNameLetter(1);
        e.preventDefault();
        return true;
      }
      if (['ArrowDown'].includes(e.code)) {
        adjustCurrentNameLetter(-1);
        e.preventDefault();
        return true;
      }
      if (e.code === 'Space') {
        lockCurrentNameLetter();
        e.preventDefault();
        return true;
      }
      return false;
    }
    if (['Space', 'Enter'].includes(e.code)) {
      advanceRaceCompleteSequence();
      e.preventDefault();
      return true;
    }
    return false;
  }

  function handleAttractKeyDown(e) {
    setMode('menu');
    e.preventDefault();
    return true;
  }

  function handleKeyDown(e) {
    if (e.code === 'KeyB') {
      toggleDebugSetting();
      if (state.mode !== 'playing') {
        markInteraction();
      }
      e.preventDefault();
      return;
    }

    if (e.code === 'KeyP') {
      if (state.mode === 'playing') {
        setMode('paused');
        resetGameplayInputs();
        e.preventDefault();
        return;
      }
      if (state.mode === 'paused') {
        resumeRace();
        e.preventDefault();
        return;
      }
    }

    if (state.mode !== 'playing') {
      markInteraction();
    }

    if (state.mode === 'playing') {
      Gameplay.keydownHandler(e);
      return;
    }

    let handled = false;
    if (state.mode === 'menu') {
      handled = handleMenuKeyDown(e);
    } else if (state.mode === 'vehicleSelect') {
      handled = handleVehicleSelectKeyDown(e);
    } else if (state.mode === 'leaderboard') {
      handled = handleLeaderboardKeyDown(e);
    } else if (state.mode === 'settings') {
      handled = handleSettingsKeyDown(e);
    } else if (state.mode === 'paused') {
      handled = handlePauseKeyDown(e);
    } else if (state.mode === 'raceComplete') {
      handled = handleRaceCompleteKeyDown(e);
    } else if (state.mode === 'attract') {
      handled = handleAttractKeyDown(e);
    }

    if (!handled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function handleKeyUp(e) {
    if (state.mode === 'playing') {
      if (e.code === 'KeyP') {
        return;
      }
      Gameplay.keyupHandler(e);
    }
  }

  function step(dt) {
    if (state.mode === 'playing') {
      Gameplay.step(dt);
    }
    if (state.mode === 'raceComplete') {
      updateRaceComplete(dt);
    }

    updateVehiclePreviewAnimation(dt);

    if (state.mode !== 'playing') {
      const suppressIdle = state.mode === 'raceComplete' && state.raceComplete.active && state.raceComplete.phase !== 'entry';
      if (!suppressIdle) {
        const idleFor = now() - state.lastInteractionAt;
        if (state.mode !== 'attract' && idleFor >= IDLE_TIMEOUT_MS) {
          goToAttract();
        }
      }
    }
  }

  function init() {
    ensureDom();
    if (Gameplay && Gameplay.state && Gameplay.state.callbacks) {
      Gameplay.state.callbacks.onRaceFinish = handleRaceFinish;
    }

    state.mainMenuIndex = 0;
    state.pauseMenuIndex = 0;
    state.settingsMenuIndex = 0;
    state.lastInteractionAt = now();
    resetRaceCompleteState();
    applyVehicleSelection(state.selectedVehicleKey);
    applyDebugModeSetting();
    setMode('menu');
    requestLeaderboard();
  }

  function isSnowEnabled() {
    return !!state.settings.snowEnabled;
  }

  function isDebugEnabled() {
    return !!state.settings.debugEnabled;
  }

  global.App = {
    state,
    init,
    step,
    handleKeyDown,
    handleKeyUp,
    handleRaceFinish,
    isSnowEnabled,
    isDebugEnabled,
  };
})(window);
