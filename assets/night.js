/* night.js — the easter egg hidden under the keyboard while Alibi is asleep.
 *
 * The hotspot only exists in the sleep state (layers.json puts `when: sleep`
 * on that pin), so this whole thing is unreachable between 08:00 and 02:00 JST
 * unless ?sleep=1 is on. index.html routes the pin's "action:night" here.
 *
 *   寝顔をみる？
 *     はい  -> quiz. Right answer shows the picture; clicking it closes.
 *              Wrong answer trips the defence system. Three of those is a
 *              game over, which reloads the page.
 *     いや   -> gentleman points.
 *
 * The wrong-answer count is per page load on purpose: reloading is the reset,
 * which is what the game over does for you.
 */
window.Night = (function () {
  'use strict';

  const QUIZ = {
    q: 'Alibiちゃんの名付けの由来は？',
    answers: [
      { t: 'Attention with Linear Biases', ok: true },
      { t: 'Adaptive Layer Bias' },
      { t: '不在証明（アリバイ）' },
      { t: 'Alignment Bias Injection' }
    ]
  };
  const MAX_MISS = 3;

  let root, zapper, over, miss = 0, opened = false;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* While a dialog is up, everything else in <body> goes inert: Tab cannot walk
     out of it and screen readers stop announcing the page behind. Escape and a
     first-element focus alone did not stop a keyboard user wandering off. */
  const seal = (keep) => {
    for (const el of document.body.children) el.inert = el !== keep;
  };
  const unseal = () => {
    for (const el of document.body.children) el.inert = false;
  };
  const shuffle = (a) => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);

  /* ---------- shell ---------- */
  function ensure() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'night';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '？');
    document.body.appendChild(root);

    zapper = document.createElement('div');
    zapper.className = 'zapper';
    zapper.setAttribute('aria-hidden', 'true');
    document.body.appendChild(zapper);

    over = document.createElement('div');
    over.id = 'gameover';
    over.setAttribute('aria-hidden', 'true');
    document.body.appendChild(over);

    // Escape backs out of anything except the game over, which has to be clicked
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && opened && !over.classList.contains('on')) close();
    });
  }

  function open() {
    ensure();
    if (opened) return;
    opened = true;
    document.body.style.overflow = 'hidden';
    root.classList.add('on');
    seal(root);
    ask();
  }

  function close() {
    if (!opened) return;
    opened = false;
    root.classList.remove('on', 'zap', 'shot');
    document.body.style.overflow = '';
    unseal();
    setTimeout(() => { if (!opened) root.textContent = ''; }, 400);
  }

  /* ---------- a visual-novel box ---------- */
  function scene(who, text, opts, extra) {
    root.className = 'on';
    root.innerHTML =
      `<div class="nv">` +
      `<span class="nv-who">${who}</span>` +
      `<div class="nv-text">${text}</div>` +
      `<div class="nv-opts"></div>` +
      (extra || '') +
      `</div>`;
    const wrap = root.querySelector('.nv-opts');
    opts.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nv-opt';
      b.textContent = o.t;
      b.addEventListener('click', o.go);
      wrap.appendChild(b);
    });
    const first = wrap.querySelector('.nv-opt');
    if (first) first.focus();
  }

  /* ---------- 1. the question ---------- */
  function ask() {
    scene('？', 'Alibiの寝顔をみる？', [
      { t: 'はい', go: quiz },
      { t: 'いや、流石に寝顔は・・・', go: gentleman }
    ]);
  }

  /* ---------- 2a. the quiz ---------- */
  function quiz() {
    const lives = `<p class="nv-lives">防護システム 残り <b>${MAX_MISS - miss}</b> / ${MAX_MISS}</p>`;
    scene('SECURITY',
      QUIZ.q + '<span class="hint">正しく答えられた者だけが通れる。</span>',
      shuffle(QUIZ.answers).map(a => ({ t: a.t, go: () => (a.ok ? reward() : wrong()) })),
      lives);
  }

  /* ---------- 2b. correct ---------- */
  function reward() {
    root.className = 'on shot';                 // portrait art wants the box centred
    root.innerHTML =
      `<button class="nv-shot" type="button" aria-label="閉じる">` +
      `<img src="assets/alibi/sleep-correct.webp" width="960" height="1200"` +
      ` alt="ベッドで大の字になって眠っている Alibiちゃん。枕元の時計は 02:41">` +
      `<figcaption><b>ALiBi — Attention with Linear Biases</b>` +
      `<span>画像をクリックで戻る</span></figcaption>` +
      `</button>`;
    const b = root.querySelector('.nv-shot');
    b.addEventListener('click', close);
    b.focus();
  }

  /* ---------- 2c. wrong ---------- */
  function wrong() {
    miss++;
    root.classList.add('zap');
    root.innerHTML = '';
    shock(() => {
      if (miss >= MAX_MISS) { gameOver(); return; }
      scene('SYSTEM',
        '防護システムにやられたようだ。',
        [{ t: '……', go: close }]);
    });
  }

  function shock(done) {
    const bolt = (x) =>
      `M${x} -20 ` + Array.from({ length: 9 }, (_, i) =>
        `L${x + (Math.random() * 120 - 60)} ${(i + 1) * 120}`).join(' ');
    zapper.innerHTML =
      `<svg viewBox="0 0 ${innerWidth} ${innerHeight}" preserveAspectRatio="none">` +
      Array.from({ length: 5 }, () =>
        `<path d="${bolt(Math.random() * innerWidth)}"/>`).join('') +
      `</svg>`;
    zapper.classList.add('on');
    if (!reduce()) document.body.classList.add('zapping');
    const hold = reduce() ? 420 : 1900;
    setTimeout(() => {
      zapper.classList.remove('on');
      zapper.innerHTML = '';
      document.body.classList.remove('zapping');
      root.classList.remove('zap');
      done();
    }, hold);
  }

  /* ---------- 2d. three strikes ---------- */
  function gameOver() {
    close();
    opened = true;                         // Escape must not dismiss this one
    document.body.style.overflow = 'hidden';
    // The viewBox is sized to the window's aspect so one unit is square in both
    // directions — stretch it and every rounded tip smears into a lozenge.
    const vh = Math.max(20, 100 * innerHeight / innerWidth);
    const drips = Array.from({ length: 16 }, () => {
      const x = Math.random() * 100;
      const w = 0.8 + Math.random() * 1.9;              // half-width of the runnel
      const len = vh * (0.06 + Math.random() * 0.42);
      return `<rect x="${x - w}" y="${-w}" width="${w * 2}" height="${len}" ` +
             `rx="${w}" fill="#8e0715"/>` +
             `<circle cx="${x}" cy="${len - w}" r="${w * 1.7}" fill="#8e0715"/>` +
             `<circle cx="${x - w * .5}" cy="${len - w * 1.5}" r="${w * .5}" ` +
             `fill="#c11a2c" opacity=".55"/>`;          // wet highlight
    }).join('');
    // a few loose spatters so the top edge is not a row of identical runnels
    const spots = Array.from({ length: 9 }, () => {
      const r = 0.6 + Math.random() * 2.2;
      return `<circle cx="${Math.random() * 100}" cy="${Math.random() * vh * .55}" ` +
             `r="${r}" fill="#8e0715" opacity="${(.35 + Math.random() * .5).toFixed(2)}"/>`;
    }).join('');
    over.innerHTML =
      `<div class="splat" aria-hidden="true"><svg viewBox="0 0 100 ${vh.toFixed(2)}" ` +
      `preserveAspectRatio="xMidYMin slice">${drips}${spots}</svg></div>` +
      `<div class="go" role="button" tabindex="0">GAME OVER<small>CLICK TO RESET</small></div>`;
    over.classList.add('on');
    over.removeAttribute('aria-hidden');
    seal(over);                            // close() unsealed on the way in here
    const go = () => location.reload();
    over.addEventListener('click', go);
    over.querySelector('.go').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    over.querySelector('.go').focus();
  }

  /* ---------- 3. the gentleman ---------- */
  function gentleman() {
    root.innerHTML = '';
    const g = document.createElement('div');
    g.className = 'gent';
    g.innerHTML = `<div class="plus">+1</div>` +
                  `<div class="cap">イギリス紳士ポイントが上がった！</div>`;
    root.appendChild(g);
    setTimeout(close, reduce() ? 900 : 1700);
  }

  return { open };
})();
