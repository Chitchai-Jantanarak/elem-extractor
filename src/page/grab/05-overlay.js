// SPDX-License-Identifier: MIT
// Adapted from Orca — https://github.com/stablyai/orca
//   src/main/browser/grab-guest-overlay-script.ts
// Copyright (c) 2026 Lovecast Inc. Licensed under the MIT License; see THIRD_PARTY_NOTICES.md.
// Changes: moved from a template string to a plain JS fragment; renamed
// Orca's window global, host element id and selection data attribute.
//
// FRAGMENT: this file is not standalone. scripts/grab-script.mjs concatenates
// all fragments in src/page/grab/ (in filename order) inside one IIFE to
// produce page/grab.js, which runs in the page's MAIN world.

var host = document.createElement('div');
host.id = '__elem-grab-host';
host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:all;cursor:crosshair;';
document.documentElement.appendChild(host);

var shadow = host.attachShadow({ mode: 'closed' });

// Visual container for highlight/label — pointer-events:none
var overlay = document.createElement('div');
overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
shadow.appendChild(overlay);

var highlightBox = document.createElement('div');
highlightBox.style.cssText = 'position:fixed;border:2px solid rgba(255,255,255,0.9);border-radius:3px;pointer-events:none;transition:all 0.05s ease-out;display:none;background:rgba(255,255,255,0.08);box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 2px 8px rgba(0,0,0,0.15);';
overlay.appendChild(highlightBox);

var hoverLabel = document.createElement('div');
hoverLabel.style.cssText = 'position:fixed;padding:3px 8px;background:rgba(30,30,30,0.92);color:#e5e5e5;font:11px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;border-radius:4px;pointer-events:none;white-space:nowrap;display:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
overlay.appendChild(hoverLabel);

var currentEl = null;

function updateHighlight(el) {
  if (!el || el === document.documentElement || el === document.body) {
    highlightBox.style.display = 'none';
    hoverLabel.style.display = 'none';
    currentEl = null;
    return;
  }
  currentEl = el;
  var rect = el.getBoundingClientRect();
  highlightBox.style.left = rect.x + 'px';
  highlightBox.style.top = rect.y + 'px';
  highlightBox.style.width = rect.width + 'px';
  highlightBox.style.height = rect.height + 'px';
  highlightBox.style.display = 'block';

  // Build label text
  var tag = el.tagName.toLowerCase();
  var role = el.getAttribute('role');
  var text = getBoundedText(el, 40);
  if (text.length > 40) text = text.slice(0, 37) + '...';
  var w = Math.round(rect.width);
  var h = Math.round(rect.height);
  var parts = [tag];
  if (role) parts.push('role=' + role);
  if (text) parts.push('"' + text + '"');
  parts.push(w + 'x' + h);
  hoverLabel.textContent = parts.join('  ');

  // Position label below the element, or above if near bottom
  var labelY = rect.bottom + 6;
  if (labelY + 28 > window.innerHeight) {
    labelY = rect.top - 28;
  }
  hoverLabel.style.left = Math.max(4, rect.x) + 'px';
  hoverLabel.style.top = labelY + 'px';
  hoverLabel.style.display = 'block';
}

function onPointerMove(e) {
  // Temporarily hide the overlay to hit-test the element underneath
  host.style.pointerEvents = 'none';
  var el = document.elementFromPoint(e.clientX, e.clientY);
  host.style.pointerEvents = 'all';
  if (el) {
    requestAnimationFrame(function() { updateHighlight(el); });
  }
}

host.addEventListener('mousemove', onPointerMove);

var selectedAttribute = "data-elem-grab-selected";
var selectedEl = null;
var selectedValue = null;
var previousSelectedValue = null;
var frozenFrame = 0;
var frozenResizeObserver = null;

function refreshFrozenHighlight() {
  frozenFrame = 0;
  if (selectedEl && selectedEl.isConnected) {
    updateHighlight(selectedEl);
  } else {
    highlightBox.style.display = 'none';
    hoverLabel.style.display = 'none';
  }
}

function scheduleFrozenHighlight() {
  if (!frozenFrame) frozenFrame = requestAnimationFrame(refreshFrozenHighlight);
}

function stopTrackingSelection() {
  window.removeEventListener('scroll', scheduleFrozenHighlight, true);
  window.removeEventListener('resize', scheduleFrozenHighlight, true);
  if (frozenResizeObserver) frozenResizeObserver.disconnect();
  frozenResizeObserver = null;
  if (frozenFrame) cancelAnimationFrame(frozenFrame);
  frozenFrame = 0;
  if (selectedEl && selectedEl.getAttribute(selectedAttribute) === selectedValue) {
    try {
      if (previousSelectedValue === null) selectedEl.removeAttribute(selectedAttribute);
      else selectedEl.setAttribute(selectedAttribute, previousSelectedValue);
    } catch(e) {}
  }
  selectedEl = null;
  selectedValue = null;
  previousSelectedValue = null;
}

// Store state for awaitClick/finalize/teardown access
window.__elemGrab = {
  host: host,
  extractPayload: extractPayload,
  getCurrentElement: function() { return currentEl; },
  freezeHighlight: function(selectionId) {
    host.removeEventListener('mousemove', onPointerMove);
    host.style.pointerEvents = 'none';
    host.style.cursor = 'default';
    selectedEl = currentEl;
    if (!selectedEl) return;
    previousSelectedValue = selectedEl.getAttribute(selectedAttribute);
    selectedValue = selectionId;
    selectedEl.setAttribute(selectedAttribute, selectionId);
    highlightBox.style.transition = 'none';
    window.addEventListener('scroll', scheduleFrozenHighlight, true);
    window.addEventListener('resize', scheduleFrozenHighlight, true);
    if (typeof ResizeObserver === 'function') {
      frozenResizeObserver = new ResizeObserver(scheduleFrozenHighlight);
      frozenResizeObserver.observe(selectedEl, { box: 'border-box' });
      // A scrollbar appearing narrows the page without a window resize.
      if (selectedEl !== document.documentElement) {
        frozenResizeObserver.observe(document.documentElement);
      }
    }
  },
  cleanup: function() {
    host.removeEventListener('mousemove', onPointerMove);
    stopTrackingSelection();
    try { host.remove(); } catch(e) {}
    delete window.__elemGrab;
  }
};
