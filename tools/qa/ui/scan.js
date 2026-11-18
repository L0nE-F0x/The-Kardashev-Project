// Runs in the page (page.evaluate(SCAN)): what is wrong with the interface on screen right now. Bad figures in the
// text (undefined, NaN, Infinity, a hyphen for a minus before a dollar), emoji (the rule is none), text cut with an
// ellipsis, parts off the window, tooltips nobody can reach, pictures that failed. Returns a list of lines.
(() => {
  const out = [];
  const ui = document.getElementById('ui');
  const W = innerWidth, H = innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return null; return r; };
  // 1. bad tokens and emoji in what is written
  const text = ui.innerText;
  for (const m of text.matchAll(/[^\n]{0,40}(undefined|NaN|Infinity|\[object|\$-|-\$|null\b|e\+\d\d)[^\n]{0,30}/g)) out.push('TEXT ' + m[0].trim());
  for (const m of text.matchAll(/[^\n]{0,30}[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}][^\n]{0,20}/gu)) if (!/[▶▸▾✓✕✗×→←↑↓■●•·★☆✔]/.test(m[0].replace(/[\u{1F300}-\u{1FAFF}]/gu, '')) || /[\u{1F300}-\u{1FAFF}]/u.test(m[0])) out.push('EMOJI ' + m[0].trim());
  // 2. text cut with an ellipsis, or a box that scrolls sideways
  const seen = new Set();
  for (const el of ui.querySelectorAll('*')) {
    if (!el.childNodes.length || el.children.length > 3) continue;
    if (el.classList.contains('fe')) continue; // Coming up's entries are cut on purpose: the strip has one line each

    const r = vis(el); if (!r) continue;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.textContent.trim().length > 2) {
      const k = (el.className || el.tagName) + '|' + el.textContent.trim().slice(0, 50);
      if (!seen.has(k) && seen.size < 14) { seen.add(k); out.push(`CUT <${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}> "${el.textContent.trim().slice(0, 60)}" ${el.clientWidth}/${el.scrollWidth}`); }
    }
  }
  // 3. interface parts off the window
  let off = 0;
  for (const el of ui.querySelectorAll('.panel, .modal, .tile, button, .frame, .goalcard, .toast')) {
    const r = vis(el); if (!r) continue;
    if ((r.right > W + 2 || r.bottom > H + 2 || r.left < -2 || r.top < -2) && off < 10) {
      // inside a scroller is fine
      let p = el.parentElement, scrolled = false;
      while (p && p !== ui) { const o = getComputedStyle(p); if (/(auto|scroll)/.test(o.overflowY + o.overflowX)) { scrolled = true; break; } p = p.parentElement; }
      if (!scrolled) { off++; out.push(`OFF <${el.tagName.toLowerCase()}.${String(el.className).slice(0, 34)}> "${el.textContent.trim().slice(0, 30)}" [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] in ${W}x${H}`); }
    }
  }
  // 4. tooltips nobody can reach
  let tips = 0;
  for (const el of ui.querySelectorAll('[data-tip]')) {
    const r = vis(el); if (!r || r.bottom < 0 || r.top > H || r.right < 0 || r.left > W) continue;
    const hit = document.elementFromPoint(Math.min(W - 1, r.left + r.width / 2), Math.min(H - 1, r.top + r.height / 2));
    if (hit && !(el === hit || el.contains(hit) || hit.closest('[data-tip]') === el) && !hit.closest('.modal, .scrim, .tut, [class*=bubble]') && getComputedStyle(el).pointerEvents === 'none' && tips++ < 6)
      out.push(`TIP unreachable <${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}> "${(el.dataset.tip || '').slice(0, 40)}"`);
  }
  // 5. images that failed
  for (const img of ui.querySelectorAll('img')) if (img.complete && img.naturalWidth === 0 && vis(img)) out.push('IMG broken ' + (img.alt || img.src.slice(0, 60)));
  return [...new Set(out)];
})()
