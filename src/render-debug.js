(function(global){
  const { Config, MathUtil } = global;

  if (!Config || !MathUtil) {
    throw new Error('RenderDebug module requires Config and MathUtil globals');
  }

  const { computeCurvature } = MathUtil;

  function createOverlay(deps = {}){
    const {
      state,
      track,
      laneToRoadRatio = (n) => n,
      getZoneLaneBounds = () => null,
      boost = {},
      drift = {},
      build = {},
      perf = null,
      groundProfileAt = () => ({ y: 0, dy: 0, d2y: 0 }),
      elevationAt = () => 0,
      segmentAtS = () => null,
      boostZonesOnSegment = () => [],
    } = deps;

    const DEBUG_PANEL_MARGIN = 24;
    const DEBUG_PANEL_GAP = 16;
    const BOOST_PANEL_WIDTH = 220;
    const BOOST_PANEL_HEIGHT = 120;
    const PROFILE_PANEL_PADDING = { top: 16, right: 18, bottom: 26, left: 18 };

    let canvasOverlay = null;
    let ctxSide = null;
    let SW = 0;
    let SH = 0;
    let overlayOn = false;

    const metersPerPixel = track && track.metersPerPixel
      ? track.metersPerPixel
      : { x: 1, y: 1 };

    function computeOverlayEnabled() {
      const app = global.App || null;
      if (app && typeof app.isDebugEnabled === 'function') {
        try {
          return !!app.isDebugEnabled();
        } catch (err) {
          // Fall through to config-based detection below.
        }
      }
      return Config.debug && Config.debug.mode !== 'off';
    }

    function syncOverlayVisibility(force = false) {
      const shouldShow = computeOverlayEnabled();
      if (force || overlayOn !== shouldShow) {
        overlayOn = shouldShow;
        if (canvasOverlay) {
          canvasOverlay.style.display = overlayOn ? 'block' : 'none';
        }
        if (!overlayOn && ctxSide) {
          ctxSide.clearRect(0, 0, SW, SH);
        }
      }
      return overlayOn;
    }

    function setOverlayCanvas(canvas){
      canvasOverlay = canvas || null;
      if (canvasOverlay){
        ctxSide = canvasOverlay.getContext('2d', { alpha:true });
        SW = canvasOverlay.width;
        SH = canvasOverlay.height;
      } else {
        ctxSide = null;
        SW = 0;
        SH = 0;
      }
      syncOverlayVisibility(true);
      return ctxSide;
    }

    function computeDebugPanels(){
      const margin = DEBUG_PANEL_MARGIN;
      const gap = DEBUG_PANEL_GAP;
      const boostPanel = {
        x: margin,
        y: margin,
        width: BOOST_PANEL_WIDTH,
        height: BOOST_PANEL_HEIGHT,
      };
      const profileX = boostPanel.x + boostPanel.width + gap;
      const profileWidth = Math.max(0, SW - profileX - margin);
      return {
        boost: boostPanel,
        profile: {
          x: profileX,
          y: margin,
          width: profileWidth,
          height: BOOST_PANEL_HEIGHT,
        },
      };
    }

    function worldToOverlay(s, y, panelRect = null){
      const pxPerMeterX = metersPerPixel.x ? (1 / metersPerPixel.x) : 1;
      const pxPerMeterY = metersPerPixel.y ? (1 / metersPerPixel.y) : 1;
      if (panelRect && panelRect.width > 0 && panelRect.height > 0){
        const pad = PROFILE_PANEL_PADDING;
        const innerWidth = Math.max(1, panelRect.width - pad.left - pad.right);
        const innerHeight = Math.max(1, panelRect.height - pad.top - pad.bottom);
        const centerX = panelRect.x + pad.left + innerWidth * 0.5;
        const centerY = panelRect.y + pad.top + innerHeight * 0.5;
        return {
          x: centerX + (s - state.phys.s) * pxPerMeterX,
          y: centerY - (y - state.phys.y) * pxPerMeterY,
        };
      }
      return {
        x:(s - state.phys.s) * pxPerMeterX + SW * 0.5,
        y: SH - (y - state.phys.y) * pxPerMeterY - 60,
      };
    }

    function drawBoostCrossSection(ctx, panelRect = null){
      if (!ctx || !state || !track) return;
      const panelX = panelRect && panelRect.x != null ? panelRect.x : DEBUG_PANEL_MARGIN;
      const panelY = panelRect && panelRect.y != null ? panelRect.y : DEBUG_PANEL_MARGIN;
      const panelWRaw = panelRect && panelRect.width != null ? panelRect.width : BOOST_PANEL_WIDTH;
      const panelHRaw = panelRect && panelRect.height != null ? panelRect.height : BOOST_PANEL_HEIGHT;
      if (panelWRaw <= 0 || panelHRaw <= 0) return;
      const panelW = panelWRaw;
      const panelH = panelHRaw;
      const roadPadX = Math.min(18, Math.max(8, panelW * 0.12));
      const roadPadTop = Math.min(24, Math.max(12, panelH * 0.2));
      const roadPadBottom = Math.min(20, Math.max(10, panelH * 0.18));
      const roadW = panelW - roadPadX * 2;
      const roadH = panelH - roadPadTop - roadPadBottom;
      if (roadW <= 0 || roadH <= 0) return;

      ctx.save();
      ctx.translate(panelX, panelY);

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, panelW, panelH);

      const roadX = roadPadX;
      const roadY = roadPadTop;
      ctx.fillStyle = '#484848';
      ctx.fillRect(roadX, roadY, roadW, roadH);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(roadX, roadY, roadW, roadH);

      const seg = segmentAtS(state.phys.s);
      const zones = boostZonesOnSegment(seg);
      const mapN = (n, fallback = 0) => {
        const ratio = laneToRoadRatio(n, fallback);
        return roadX + ratio * roadW;
      };
      const mapRatio = (ratio) => roadX + ratio * roadW;

      for (const zone of zones){
        const bounds = getZoneLaneBounds(zone);
        if (!bounds) continue;
        const zoneColors = boost.colors ? (boost.colors[zone.type] || boost.fallbackColor) : null;
        const fillColor = zoneColors && zoneColors.fill ? zoneColors.fill : 'rgba(255,255,255,0.35)';
        const strokeColor = zoneColors && zoneColors.stroke ? zoneColors.stroke : 'rgba(255,255,255,0.65)';
        const x1 = mapRatio(bounds.roadRatioMin);
        const x2 = mapRatio(bounds.roadRatioMax);
        const zx = Math.min(x1, x2);
        const zw = Math.max(2, Math.abs(x2 - x1));
        ctx.fillStyle = fillColor;
        ctx.fillRect(zx, roadY, zw, roadH);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(zx, roadY, zw, roadH);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      const centerX = mapN(0);
      ctx.beginPath();
      ctx.moveTo(centerX, roadY);
      ctx.lineTo(centerX, roadY + roadH);
      ctx.stroke();

      const playerX = mapN(state.playerN);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(playerX, roadY + roadH * 0.5, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '11px system-ui, Arial';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Cross-section', 0, panelH - 4);

      ctx.restore();
    }

    function renderOverlay(){
      if (!syncOverlayVisibility() || !ctxSide || !state || !track) return;
      ctxSide.clearRect(0, 0, SW, SH);

      const panels = computeDebugPanels();
      const boostPanel = panels.boost;
      const profilePanel = panels.profile;
      const pad = PROFILE_PANEL_PADDING;
      const innerProfileX = profilePanel.x + pad.left;
      const innerProfileY = profilePanel.y + pad.top;
      const innerProfileW = Math.max(1, profilePanel.width - pad.left - pad.right);
      const innerProfileH = Math.max(1, profilePanel.height - pad.top - pad.bottom);

      if (profilePanel.width > 0 && profilePanel.height > 0){
        ctxSide.fillStyle = 'rgba(0,0,0,0.55)';
        ctxSide.fillRect(profilePanel.x, profilePanel.y, profilePanel.width, profilePanel.height);
        ctxSide.strokeStyle = 'rgba(255,255,255,0.25)';
        ctxSide.lineWidth = 1;
        ctxSide.strokeRect(profilePanel.x, profilePanel.y, profilePanel.width, profilePanel.height);

        ctxSide.save();
        ctxSide.beginPath();
        ctxSide.rect(innerProfileX, innerProfileY, innerProfileW, innerProfileH);
        ctxSide.clip();

        ctxSide.lineWidth = 2;
        ctxSide.strokeStyle = state.phys.boostFlashTimer>0 ? '#d32f2f' : '#1976d2';
        ctxSide.beginPath();
        const sHalf = innerProfileW * 0.5 * metersPerPixel.x;
        const sStart = state.phys.s - sHalf;
        const sEnd   = state.phys.s + sHalf;
        const step   = Math.max(5, 2*metersPerPixel.x);
        let first = true;
        for (let s = sStart; s <= sEnd; s += step){
          const p = worldToOverlay(s, elevationAt(s), profilePanel);
          if (first){ ctxSide.moveTo(p.x,p.y); first=false; } else { ctxSide.lineTo(p.x,p.y); }
        }
        ctxSide.stroke();

        const p = worldToOverlay(state.phys.s, state.phys.y, profilePanel);
        ctxSide.fillStyle = '#2e7d32';
        ctxSide.beginPath(); ctxSide.arc(p.x, p.y, 6, 0, Math.PI*2); ctxSide.fill();

        ctxSide.restore();

        ctxSide.fillStyle = '#ffffff';
        ctxSide.font = '11px system-ui, Arial';
        ctxSide.textBaseline = 'bottom';
        ctxSide.fillText('Elevation profile', profilePanel.x + pad.left, profilePanel.y + profilePanel.height - 6);
      }

      drawBoostCrossSection(ctxSide, boostPanel);

      const metrics = state.metrics || null;
      const fmtSeconds = (value) => {
        if (!Number.isFinite(value) || value <= 0) return '0.00s';
        return `${value.toFixed(2)}s`;
      };
      const fmtCount = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
      const fmtSpeed = (value) => {
        if (!Number.isFinite(value) || value <= 0) return '0.0';
        return value.toFixed(1);
      };
      const fmtFloat = (value, digits = 1, fallback = '0.0') => (
        Number.isFinite(value) ? value.toFixed(digits) : fallback
      );

      const debugLines = [];

      if (metrics) {
        debugLines.push(
          `NPC hits: ${fmtCount(metrics.npcHits)}`,
          `Near misses: ${fmtCount(metrics.nearMisses)}`,
          `Guardrail hits: ${fmtCount(metrics.guardRailHits)}`,
          `Guardrail time: ${fmtSeconds(metrics.guardRailContactTime)}`,
          `Pickups: ${fmtCount(metrics.pickupsCollected)}`,
          `Air time: ${fmtSeconds(metrics.airTime)}`,
          `Drift time: ${fmtSeconds(metrics.driftTime)}`,
          `Top speed: ${fmtSpeed(metrics.topSpeed)} u/s`,
          `Respawns: ${fmtCount(metrics.respawnCount)}`,
          `Off-road time: ${fmtSeconds(metrics.offRoadTime)}`,
        );
      }

      if (perf && typeof perf.getLastFrameStats === 'function') {
        const perfStats = perf.getLastFrameStats();
        if (perfStats) {
          const fpsDisplay = fmtFloat(perfStats.fps, 1, '0.0');
          const frameMsDisplay = fmtFloat(perfStats.frameTimeMs, 2, '0.00');
          debugLines.push(
            `FPS: ${fpsDisplay} (${frameMsDisplay}ms)`,
            `Visible quads: ${fmtCount(perfStats.quadCount)} (solid ${fmtCount(perfStats.solidQuadCount)}, textured ${fmtCount(perfStats.texturedQuadCount)})`,
            `Draw calls: ${fmtCount(perfStats.drawCalls)} | Draw list: ${fmtCount(perfStats.drawListSize)} items`,
            `Strips: ${fmtCount(perfStats.stripCount)} | Sprites: ${fmtCount(perfStats.spriteCount)} (NPC ${fmtCount(perfStats.npcCount)}, props ${fmtCount(perfStats.propCount)}, player ${fmtCount(perfStats.playerCount)})`,
            `Snow: ${fmtCount(perfStats.snowQuadCount)} quads across ${fmtCount(perfStats.snowScreenCount)} screens`,
            `Boost quads: ${fmtCount(perfStats.boostQuadCount)} | Physics steps: ${fmtCount(perfStats.physicsSteps)} | Segments: ${fmtCount(perfStats.segments)}`,
          );
        }
      }

      if (debugLines.length) {
        const listPanelX = DEBUG_PANEL_MARGIN;
        const listPanelY = boostPanel.y + boostPanel.height + DEBUG_PANEL_GAP;
        const listPanelWidth = Math.max(180, Math.min(300, SW - listPanelX - DEBUG_PANEL_MARGIN));
        const lineHeight = 16;
        const listPanelHeight = debugLines.length * lineHeight + 12;
        if (listPanelWidth > 0 && listPanelHeight > 0 && listPanelY < SH) {
          const availableHeight = Math.max(0, SH - listPanelY - DEBUG_PANEL_MARGIN);
          const clampedHeight = Math.max(0, Math.min(listPanelHeight, availableHeight));
          ctxSide.fillStyle = 'rgba(0,0,0,0.55)';
          if (clampedHeight > 0) {
            ctxSide.fillRect(listPanelX, listPanelY, listPanelWidth, clampedHeight);
            ctxSide.strokeStyle = 'rgba(255,255,255,0.25)';
            ctxSide.lineWidth = 1;
            ctxSide.strokeRect(listPanelX, listPanelY, listPanelWidth, clampedHeight);
            ctxSide.fillStyle = '#ffffff';
            ctxSide.font = '12px system-ui, Arial';
            ctxSide.textBaseline = 'top';
            const textX = listPanelX + 8;
            let textY = listPanelY + 6;
            for (const line of debugLines) {
              if (textY + lineHeight > listPanelY + clampedHeight) break;
              ctxSide.fillText(line, textX, textY);
              textY += lineHeight;
            }
          }
        }
      }

      const { dy, d2y } = groundProfileAt(state.phys.s);
      const kap = computeCurvature(dy, d2y);
      const boostingHUD = (state.boostTimer>0) ? `boost:${state.boostTimer.toFixed(2)}s ` : '';
      const driftHUD = `drift:${state.driftState}${state.driftState==='drifting'?' dir='+state.driftDirSnapshot:''} charge:${state.driftCharge.toFixed(2)}/${drift.chargeMin} armed:${state.allowedBoost}`;
      const buildVersion = (typeof build.version === 'string' && build.version.length > 0)
        ? build.version
        : null;
      const versionHUD = buildVersion ? `ver:${buildVersion}  ` : '';
      const hud = `${versionHUD}${boostingHUD}${driftHUD}  vtan:${state.phys.vtan.toFixed(1)}  grounded:${state.phys.grounded}  kappa:${kap.toFixed(5)}  n:${state.playerN.toFixed(2)}  cars:${state.cars.length}`;
      ctxSide.fillStyle = '#fff';
      ctxSide.strokeStyle = '#000';
      ctxSide.lineWidth = 3;
      ctxSide.font = '12px system-ui, Arial';
      ctxSide.strokeText(hud, 10, SH-12);
      ctxSide.fillText(hud, 10, SH-12);
    }

    return {
      setOverlayCanvas,
      syncOverlayVisibility,
      computeOverlayEnabled,
      renderOverlay,
    };
  }

  global.RenderDebug = Object.freeze({ createOverlay });
})(typeof window !== 'undefined' ? window : globalThis);
