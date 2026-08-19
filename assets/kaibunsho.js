/* kaibunsho.js — why the left half of the pointing banner is empty.
 *
 * Tap Alibi's chest five times (each tap within 1.5s of the last) and she
 * grins; the creator's stream of consciousness scrolls up the empty space,
 * fetched from docs/creators-weird-message.txt — the same file anyone could
 * have read by URL all along. Tap her again (or Escape) and she composes
 * herself and the text drains away.
 *
 * Markup contract, on the banner <img>:
 *   data-kaibunsho="docs/creators-weird-message.txt"  the scroll source
 *   data-grin="assets/banner/alibi-grin.webp"         the face to swap in
 * The parent element must be position:relative (both banners already are).
 *
 * Self-contained: injects its own styles, so the two pages that carry the
 * banner only add one <script>.
 */
(() => {
  'use strict';

  const TAPS = 5;          // how many
  const WINDOW = 2500;     // ms allowed between taps — snug enough to stay an
                           // intentional rhythm, loose enough for a trackpad
  const SPEED = 85;        // px/s the column climbs

  const CSS = `
  .kai-zone{
    /* the black tank-top bust, measured on a 2% grid: x 62-80%, y 42-58%.
       The first fit was one face too high — a 5% grid made the head look
       half its real size, and the zone landed on her mouth. */
    position:absolute; left:62%; top:42%; width:18%; height:16%;
    background:transparent; border:0; padding:0; margin:0;
    cursor:inherit;                         /* no hint — it has to be found */
  }
  /* a counted tap answers with a small heart, so once the spot is found the
     player can tell "keep going" from "missed" — before that, nothing shows */
  .kai-pop{
    position:absolute; z-index:5;
    font-size:clamp(13px,1.3vw,19px);
    color:#ff3d92;
    pointer-events:none; user-select:none;
    transform:translate(-50%,-50%);
    animation:kaiPop .8s ease-out forwards;
  }
  @keyframes kaiPop{
    0%  {opacity:0; transform:translate(-50%,-30%) scale(.6)}
    25% {opacity:1}
    100%{opacity:0; transform:translate(-50%,-160%) scale(1.15)}
  }
  @media (prefers-reduced-motion:reduce){.kai-pop{animation:none;opacity:0}}
  .kai-grin{
    position:absolute; inset:0; width:100%; height:100%;
    object-fit:cover;
    opacity:0; transition:opacity .5s ease;
    pointer-events:none;
    z-index:3;
  }
  .kai-grin.on{opacity:1}
  .kai-flow{
    position:absolute; left:2.5%; top:0; bottom:0; width:37%;
    overflow:hidden;
    pointer-events:none;
    z-index:4;
    opacity:0; transition:opacity .8s ease;
    transform:rotate(-1.2deg);
    -webkit-mask-image:linear-gradient(180deg, transparent, #000 9%, #000 91%, transparent);
    mask-image:linear-gradient(180deg, transparent, #000 9%, #000 91%, transparent);
  }
  .kai-flow.on{opacity:1}
  .kai-col{
    display:flex; flex-direction:column; gap:.28em;
    font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",-apple-system,
                BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;
    font-size:clamp(10px, 1.05vw, 14px);
    font-weight:600;
    line-height:1.75;
    color:rgba(58,38,66,.78);
    white-space:pre-wrap;
    will-change:transform;
  }
  .kai-col .k-em{color:rgba(214,32,110,.85); font-weight:800}
  @media (prefers-reduced-motion:reduce){
    .kai-grin{transition:none}
    .kai-flow{transition:none;
      pointer-events:auto; overflow-y:auto;
      -webkit-mask-image:none; mask-image:none}
  }`;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let styled = false;
  const style = () => {
    if (styled) return;
    styled = true;
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
  };

  let textCache = null;
  const fetchText = async (url) => {
    if (textCache) return textCache;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    textCache = (await res.text()).replace(/\r/g, '').split('\n');
    return textCache;
  };

  function boot(img) {
    const host = img.parentElement;
    if (!host) return;
    style();

    const zone = document.createElement('button');
    zone.type = 'button';
    zone.className = 'kai-zone';
    zone.tabIndex = -1;
    zone.setAttribute('aria-hidden', 'true');
    host.appendChild(zone);

    let grin = null, flow = null, raf = 0;
    let taps = 0, lastTap = 0, active = false;

    const buildGrin = () => {
      grin = document.createElement('img');
      grin.src = img.dataset.grin;
      grin.alt = '';
      grin.className = 'kai-grin';
      grin.setAttribute('aria-hidden', 'true');
      host.appendChild(grin);
    };

    const buildFlow = (lines) => {
      flow = document.createElement('div');
      flow.className = 'kai-flow';
      flow.setAttribute('aria-hidden', 'true');
      const col = document.createElement('div');
      col.className = 'kai-col';
      for (const line of lines) {
        const d = document.createElement('div');
        d.textContent = line || ' ';
        // the verdict lines are the punchlines, so they get the accent
        if (/^(採用。|好き。|最高。|完璧。)$/.test(line.trim())) d.className = 'k-em';
        col.appendChild(d);
      }
      flow.appendChild(col);
      host.appendChild(flow);
      return col;
    };

    // rAF drive instead of a CSS animation: the duration depends on the
    // rendered height of 600-odd lines, which CSS cannot know
    const scroll = (col) => {
      const H = host.clientHeight;
      let y = H;                       // enter from below the fold
      // place it there before the first frame, or the column flashes at the
      // top of the banner for the instant before rAF ticks
      col.style.transform = `translateY(${y}px)`;
      let prev = performance.now();
      const step = (now) => {
        y -= ((now - prev) / 1000) * SPEED;
        prev = now;
        if (y < -col.scrollHeight) y = H;   // ran out — start over
        col.style.transform = `translateY(${y}px)`;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const activate = async () => {
      active = true;
      if (!grin) buildGrin();
      grin.classList.add('on');
      try {
        const lines = await fetchText(img.dataset.kaibunsho);
        if (!active) return;           // dismissed while the fetch was out
        if (!flow) {
          const col = buildFlow(lines);
          if (!reduce) scroll(col);
        } else if (!reduce && !raf) {
          scroll(flow.querySelector('.kai-col'));
        }
        flow.classList.add('on');
      } catch (e) {
        console.warn('kaibunsho:', e);  // the grin alone still lands
      }
    };

    const deactivate = () => {
      active = false;
      taps = 0;
      if (grin) grin.classList.remove('on');
      if (flow) flow.classList.remove('on');
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };

    const pop = (e) => {
      const r = host.getBoundingClientRect();
      const p = document.createElement('span');
      p.className = 'kai-pop';
      p.textContent = '♡';
      p.style.left = ((e.clientX - r.left) / r.width * 100) + '%';
      p.style.top = ((e.clientY - r.top) / r.height * 100) + '%';
      host.appendChild(p);
      setTimeout(() => p.remove(), 900);
    };

    zone.addEventListener('pointerdown', (e) => {
      e.stopPropagation();             // this tap is hers, not the ripple's
      if (active) { deactivate(); return; }
      const now = performance.now();
      taps = (now - lastTap <= WINDOW) ? taps + 1 : 1;
      lastTap = now;
      pop(e);
      if (taps >= TAPS) activate();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && active) deactivate();
    });
  }

  const start = () => {
    document.querySelectorAll('img[data-kaibunsho]').forEach(boot);
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();
})();
