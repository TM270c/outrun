(function (global) {
  const { Gameplay } = global;

  if (!Gameplay) {
    throw new Error('App module requires Gameplay global');
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

  const settingsMenuKeys = ['snow', 'back'];

  const state = {
    mode: 'menu',
    mainMenuIndex: 0,
    pauseMenuIndex: 0,
    settingsMenuIndex: 0,
    settings: { snowEnabled: true },
    leaderboard: {
      loading: false,
      error: null,
      entries: [],
    },
    dom: {
      menuLayer: null,
      menuPanel: null,
    },
  };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function wrapPanel({ title, subtitle = '', body = '', footer = '', modifier = '' }) {
    const subtitleHtml = subtitle ? `<div class="menu-subtitle">${subtitle}</div>` : '';
    return `
      <div class="menu-panel-inner ${modifier}">
        ${title ? `<div class="menu-title">${title}</div>` : ''}
        ${subtitleHtml}
        <div class="menu-body">${body}</div>
        ${footer ? `<div class="menu-footer">${footer}</div>` : ''}
      </div>
    `;
  }

  function setMode(nextMode) {
    if (state.mode === nextMode) return;
    state.mode = nextMode;
    if (nextMode === 'playing') {
      state.mainMenuIndex = 0;
      state.pauseMenuIndex = 0;
      state.settingsMenuIndex = 0;
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
    const optionsHtml = mainMenuOptions
      .map((option, idx) => {
        const selected = idx === state.mainMenuIndex ? ' is-selected' : '';
        return `
          <li class="menu-option${selected}" data-key="${option.key}">
            <span class="menu-option-label">${escapeHtml(option.label)}</span>
          </li>
        `;
      })
      .join('');
    const body = `<ul class="menu-options">${optionsHtml}</ul>`;
    const footer = 'Arrow Keys to Navigate · Space to Select';
    return wrapPanel({ title: 'Outrun', subtitle: 'Neon Grand Prix', body, footer });
  }

  function renderLeaderboard() {
    const { loading, error, entries } = state.leaderboard;
    let body = '';
    if (loading) {
      body = '<div class="menu-message">Loading leaderboard…</div>';
    } else if (error) {
      body = '<div class="menu-message">Leaderboard unavailable</div>';
    } else if (!entries.length) {
      body = '<div class="menu-message">No leaderboard data</div>';
    } else {
      const rows = entries
        .map((entry, idx) => {
          const rank = idx + 1;
          return `
            <li class="leaderboard-row">
              <span class="leaderboard-row-rank">${escapeHtml(String(rank).padStart(2, '0'))}</span>
              <span class="menu-option-label">${escapeHtml(entry.name)}</span>
              <span class="menu-option-value">${escapeHtml(entry.points)}</span>
            </li>
          `;
        })
        .join('');
      body = `<ul class="leaderboard-list">${rows}</ul>`;
    }
    const footer = 'Space or Esc to Return';
    return wrapPanel({ title: 'Leaderboard', body, footer, modifier: 'is-leaderboard' });
  }

  function renderSettings() {
    const options = [
      {
        key: 'snow',
        label: 'Snow Effects',
        value: state.settings.snowEnabled ? 'ON' : 'OFF',
      },
      {
        key: 'back',
        label: 'Back',
        value: '',
      },
    ];

    const optionsHtml = options
      .map((option, idx) => {
        const selected = idx === state.settingsMenuIndex ? ' is-selected' : '';
        const valueHtml = option.value
          ? `<span class="menu-option-value">${escapeHtml(option.value)}</span>`
          : '';
        return `
          <li class="menu-option${selected}" data-key="${option.key}">
            <span class="menu-option-label">${escapeHtml(option.label)}</span>
            ${valueHtml}
          </li>
        `;
      })
      .join('');

    const body = `<ul class="menu-options">${optionsHtml}</ul>`;
    const footer = 'Arrow Keys to Adjust · Space to Toggle · Esc to Return';
    return wrapPanel({ title: 'Settings', body, footer, modifier: 'is-settings' });
  }

  function renderPauseMenu() {
    const optionsHtml = pauseMenuOptions
      .map((option, idx) => {
        const selected = idx === state.pauseMenuIndex ? ' is-selected' : '';
        return `
          <li class="menu-option${selected}" data-key="${option.key}">
            <span class="menu-option-label">${escapeHtml(option.label)}</span>
          </li>
        `;
      })
      .join('');
    const body = `<ul class="menu-options">${optionsHtml}</ul>`;
    const footer = 'Space to Confirm · Esc to Resume';
    return wrapPanel({ title: 'Paused', body, footer, modifier: 'is-paused' });
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
    } else {
      html = '';
    }
    menuPanel.innerHTML = html;
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

  function toggleSnowSetting() {
    state.settings.snowEnabled = !state.settings.snowEnabled;
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

  function startRace() {
    setMode('playing');
    resetGameplayInputs();
    Promise.resolve(Gameplay.resetScene && Gameplay.resetScene())
      .catch((err) => console.error('Failed to start race', err));
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
      startRace();
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
    fetch('data/leaderboard.csv')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        const entries = parseLeaderboardCsv(text);
        state.leaderboard.entries = entries;
        state.leaderboard.loading = false;
        state.leaderboard.error = null;
        updateMenuLayer();
      })
      .catch((err) => {
        console.error('Failed to load leaderboard', err);
        state.leaderboard.loading = false;
        state.leaderboard.error = err;
        updateMenuLayer();
      });
  }

  function parseLeaderboardCsv(text) {
    if (!text) return [];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (!lines.length) return [];
    const header = lines[0].split(',').map((part) => part.trim().toLowerCase());
    const nameIndex = header.indexOf('name');
    const pointsIndex = header.indexOf('points');
    const dateIndex = header.indexOf('date');
    const entries = [];
    for (let i = 1; i < lines.length; i += 1) {
      const parts = lines[i].split(',');
      if (!parts.length) continue;
      const name = parts[nameIndex >= 0 ? nameIndex : 0] || '';
      const points = parts[pointsIndex >= 0 ? pointsIndex : 1] || '';
      const date = parts[dateIndex >= 0 ? dateIndex : 2] || '';
      entries.push({
        name: String(name).trim().toUpperCase(),
        points: String(points).trim(),
        date: String(date).trim(),
      });
    }
    entries.sort((a, b) => {
      const scoreA = Number.parseFloat(a.points) || 0;
      const scoreB = Number.parseFloat(b.points) || 0;
      if (scoreA === scoreB) {
        return a.name.localeCompare(b.name);
      }
      return scoreB - scoreA;
    });
    return entries;
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

  function handleKeyDown(e) {
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

    if (state.mode === 'playing') {
      Gameplay.keydownHandler(e);
      return;
    }

    let handled = false;
    if (state.mode === 'menu') {
      handled = handleMenuKeyDown(e);
    } else if (state.mode === 'leaderboard') {
      handled = handleLeaderboardKeyDown(e);
    } else if (state.mode === 'settings') {
      handled = handleSettingsKeyDown(e);
    } else if (state.mode === 'paused') {
      handled = handlePauseKeyDown(e);
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
  }

  function init() {
    ensureDom();
    state.mode = 'menu';
    state.mainMenuIndex = 0;
    state.pauseMenuIndex = 0;
    state.settingsMenuIndex = 0;
    updateMenuLayer();
    requestLeaderboard();
  }

  function isSnowEnabled() {
    return !!state.settings.snowEnabled;
  }

  global.App = {
    state,
    init,
    step,
    handleKeyDown,
    handleKeyUp,
    isSnowEnabled,
  };
})(window);
