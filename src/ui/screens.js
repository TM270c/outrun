(function (global) {
  const screens = global.AppScreens || (global.AppScreens = {});

  function ensureEscapeHtml(helpers = {}) {
    return helpers.escapeHtml || ((value) => String(value ?? ''));
  }

  screens.mainMenu = function mainMenuScreen(ctx = {}, helpers = {}) {
    const { title = 'Outrun', subtitle = '', options = [], selectedIndex = 0 } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    const subtitleHtml = subtitle
      ? `<p class="screen-subtitle">${escapeHtml(subtitle)}</p>`
      : '';

    const listItems = options
      .map((option = {}, idx) => {
        const key = escapeHtml(option.key || '');
        const label = escapeHtml(option.label || '');
        const selectedClass = idx === selectedIndex ? ' is-selected' : '';
        return `
          <li class="menu-item${selectedClass}" data-key="${key}">
            <span class="menu-label">${label}</span>
          </li>
        `;
      })
      .join('');

    const listHtml = listItems ? `<ul class="menu-list">${listItems}</ul>` : '';
    const hintText = options.length > 0 ? 'Space to select' : 'Press Space to Start';

    return `
      <div class="screen screen-menu">
        <h1 class="screen-title">${escapeHtml(title)}</h1>
        ${subtitleHtml}
        ${listHtml}
        <p class="screen-hint">${hintText}</p>
      </div>
    `;
  };

  screens.pauseMenu = function pauseMenuScreen(ctx = {}, helpers = {}) {
    const { options = [], selectedIndex = 0 } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    const listItems = options
      .map((option = {}, idx) => {
        const key = escapeHtml(option.key || '');
        const label = escapeHtml(option.label || '');
        const selectedClass = idx === selectedIndex ? ' is-selected' : '';
        return `
          <li class="menu-item${selectedClass}" data-key="${key}">
            <span class="menu-label">${label}</span>
          </li>
        `;
      })
      .join('');

    return `
      <div class="screen screen-menu">
        <h2 class="screen-title">Paused</h2>
        <ul class="menu-list">${listItems}</ul>
        <p class="screen-hint">Space confirm · Esc resume</p>
      </div>
    `;
  };

  screens.vehicleSelect = function vehicleSelectScreen(ctx = {}, helpers = {}) {
    const {
      title = 'Select Vehicle',
      vehicleLabel = '',
      vehicleDescription = '',
      optionIndex = 0,
      optionCount = 0,
    } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    const clampedIndex = optionCount > 0 ? Math.min(optionCount, Math.max(1, optionIndex + 1)) : 0;
    const counterLabel = optionCount > 0
      ? `${clampedIndex} / ${optionCount}`
      : '';
    const counterHtml = counterLabel
      ? `<p class="vehicle-select-counter">${escapeHtml(counterLabel)}</p>`
      : '';

    return `
      <div class="screen screen-menu screen-vehicle-select">
        <h2 class="screen-title">${escapeHtml(title)}</h2>
        <div class="vehicle-select-info">
          <p class="vehicle-select-name">${escapeHtml(vehicleLabel)}</p>
          <p class="vehicle-select-desc">${escapeHtml(vehicleDescription)}</p>
          ${counterHtml}
        </div>
        <p class="screen-hint">Arrows to browse · Space to select</p>
      </div>
    `;
  };

  screens.trackSelect = function trackSelectScreen(ctx = {}, helpers = {}) {
    const {
      title = 'Select Track',
      trackLabel = '',
      trackDescription = '',
      optionIndex = 0,
      optionCount = 0,
    } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    return `
      <div class="screen screen-menu screen-vehicle-select">
        <h2 class="screen-title">${escapeHtml(title)}</h2>
        <div class="vehicle-select-info">
          <p class="vehicle-select-name">${escapeHtml(trackLabel)}</p>
          <p class="vehicle-select-desc">${escapeHtml(trackDescription)}</p>
        </div>
        <p class="screen-hint">Arrows to browse · Space to select</p>
      </div>
    `;
  };

  screens.settingsMenu = function settingsMenuScreen(ctx = {}, helpers = {}) {
    const { options = [], selectedIndex = 0 } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    const listItems = options
      .map((option = {}, idx) => {
        const key = escapeHtml(option.key || '');
        const label = escapeHtml(option.label || '');
        const value = option.value ? escapeHtml(option.value) : '';
        const selectedClass = idx === selectedIndex ? ' is-selected' : '';
        const valueHtml = value ? `<span class="menu-value">${value}</span>` : '';
        return `
          <li class="menu-item${selectedClass}" data-key="${key}">
            <span class="menu-label">${label}</span>
            ${valueHtml}
          </li>
        `;
      })
      .join('');

    return `
      <div class="screen screen-menu">
        <h2 class="screen-title">Settings</h2>
        <ul class="menu-list menu-list--settings">${listItems}</ul>
        <p class="screen-hint">Arrows adjust · Space toggle</p>
      </div>
    `;
  };

  screens.leaderboard = function leaderboardScreen(ctx = {}, helpers = {}) {
    const { loading = false, error = null, entries = [] } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    let bodyHtml = '';
    if (loading) {
      bodyHtml = '<p class="screen-message">Loading leaderboard…</p>';
    } else if (error) {
      bodyHtml = '<p class="screen-message">Leaderboard unavailable</p>';
    } else if (!entries.length) {
      bodyHtml = '<p class="screen-message">No leaderboard data</p>';
    } else {
      const items = entries
        .map((entry = {}) => {
          const rank = entry.rank != null ? escapeHtml(String(entry.rank).padStart(2, '0')) : '';
          const name = escapeHtml(entry.name || '---');
          const score = escapeHtml(entry.score || '');
          const highlightClass = entry.isHighlight ? ' is-highlight' : '';
          return `
            <li class="leaderboard-item${highlightClass}">
              <span class="leaderboard-rank">${rank}</span>
              <span class="leaderboard-name">${name}</span>
              <span class="leaderboard-score">${score}</span>
            </li>
          `;
        })
        .join('');
      bodyHtml = `<ul class="leaderboard-list">${items}</ul>`;
    }

    return `
      <div class="screen screen-menu screen-leaderboard">
        <h2 class="screen-title">Leaderboard</h2>
        ${bodyHtml}
        <p class="screen-hint">Space or Esc to return</p>
      </div>
    `;
  };

  screens.attract = function attractScreen(ctx = {}) {
    const { videoSrc = 'video/attract-loop.mp4' } = ctx;
    const sourceHtml = videoSrc
      ? `<source src="${videoSrc}" type="video/mp4" />`
      : '';

    return `
      <div class="screen screen-attract screen-full">
        <video id="appAttractVideo" class="attract-video" autoplay muted loop playsinline>
          ${sourceHtml}
        </video>
      </div>
    `;
  };

  screens.raceComplete = function raceCompleteScreen(ctx = {}, helpers = {}) {
    const {
      active = false,
      phase = 'idle',
      timeLabel = '--',
      letters = [],
      confirmed = [],
      currentIndex = 0,
      playerRank = null,
    } = ctx;
    const escapeHtml = ensureEscapeHtml(helpers);

    if (!active) {
      return `
        <div class="screen screen-score screen-full">
          <h2 class="screen-score-title">Race Complete</h2>
          <p class="screen-message">Preparing results…</p>
        </div>
      `;
    }

    if (phase === 'entry') {
      const lettersHtml = letters
        .map((letter, idx) => {
          const classes = ['name-entry-letter'];
          if (idx === currentIndex) classes.push('is-active');
          if (confirmed[idx]) classes.push('is-locked');
          return `<span class="${classes.join(' ')}">${escapeHtml(letter || '')}</span>`;
        })
        .join('');

      return `
        <div class="screen screen-score screen-full">
          <h2 class="screen-score-title">Race Complete</h2>
          <div class="screen-score-time">${escapeHtml(timeLabel)}</div>
          <div class="screen-message">Enter your name</div>
          <div class="name-entry">${lettersHtml}</div>
          <p class="screen-score-note">Arrows to change · Space to lock</p>
        </div>
      `;
    }

    let statusMessage = 'Result saved';
    if (phase === 'revealPlayer') {
      statusMessage = playerRank != null
        ? `You placed #${escapeHtml(String(playerRank))}`
        : 'Result recorded';
    } else if (phase === 'revealTop') {
      statusMessage = 'Highlighting standings';
    } else if (phase === 'complete') {
      statusMessage = 'Returning to attract mode…';
    }

    const rankHtml = playerRank != null
      ? `<p class="screen-score-note">Final rank: #${escapeHtml(String(playerRank))}</p>`
      : '';

    return `
      <div class="screen screen-score screen-full">
        <h2 class="screen-score-title">Race Complete</h2>
        <div class="screen-score-time">${escapeHtml(timeLabel)}</div>
        <p class="screen-message">${statusMessage}</p>
        ${rankHtml}
        <p class="screen-score-note">Press Space to continue</p>
      </div>
    `;
  };
})(window);
