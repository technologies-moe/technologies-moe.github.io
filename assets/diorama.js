/* Layered parallax diorama.
   Placement data lives in assets/room/layers.json; /tune.html edits it.

   Each cut-out is a full-frame sheet. --sx/--sy/--tx/--ty put it back into the
   composition: the scaled sheet's centre lands at (50+tx, 50+ty) percent of the
   stage. x and y scale separately because props are drawn at whatever aspect the
   generator felt like, not the one the spot in the room needs.

   par is the parallax coefficient, normalised so the character plane = 1.0.
   z is derived from it, so depth and travel can never disagree. */
window.Diorama = (function () {
  'use strict';

  const Z_SPREAD = 400;
  const zOf = (par) => Math.round((par - 1) * Z_SPREAD);

  /* JST is fixed at UTC+9 all year, so the hour can be read straight off the
     UTC clock — no timezone database, and it stays correct wherever the
     visitor actually is. */
  function jstHour(now) {
    return ((now || new Date()).getUTCHours() + 9) % 24;
  }

  /* The room has two states. Between 02:00 and 08:00 JST Alibi is asleep, so
     the chair carries the SLEEP MODE board instead of her. `?sleep=1` / `?sleep=0`
     forces either state for testing. */
  function mode(search) {
    const q = new URLSearchParams(search != null ? search : location.search).get('sleep');
    if (q === '1' || q === 'on'  || q === 'true')  return 'sleep';
    if (q === '0' || q === 'off' || q === 'false') return 'awake';
    const h = jstHour();
    return (h >= 2 && h < 8) ? 'sleep' : 'awake';
  }

  /* Time of day is a separate axis from sleep: it picks which lighting sheet
     the room base uses (a layer lists them under `variants`), while sleep
     decides who is in the chair. 06-12 morning, 12-18 default, 18-22 evening,
     22-06 night — the spec named 12-16 and 22-28, so the 16-18 and 04-06 gaps
     extend their neighbours. `?room=morning|default|evening|night` forces one. */
  function roomVariant(search, now) {
    const q = new URLSearchParams(search != null ? search : location.search).get('room');
    if (['morning', 'default', 'evening', 'night'].includes(q)) return q;
    const h = jstHour(now);
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'default';
    if (h >= 18 && h < 22) return 'evening';
    return 'night';
  }

  function build(root, data, state) {
    const camera = root.querySelector('.camera');
    camera.textContent = '';
    const made = [];
    const now = state || mode();
    // the tuner passes 'all' and gets the default lighting — placement work
    // should not depend on what time it happens at
    const variant = now === 'all' ? 'default' : roomVariant();
    root.classList.remove('t-morning', 't-default', 't-evening', 't-night');
    root.classList.add('t-' + variant);

    // a layer with `when` only exists in that state; everything else is always on.
    // the tuner passes 'all' so both states can be placed whatever the clock says.
    data.layers.filter(L => !L.when || now === 'all' || L.when === now).forEach((L, i) => {
      const el = document.createElement('div');
      el.className = 'layer';
      el.dataset.id = L.id;
      el.style.setProperty('--delay', (i * 0.06).toFixed(2) + 's');
      el.setAttribute('aria-hidden', 'true');

      if (L.shade) {
        const s = document.createElement('i');
        s.className = 'foot-shade';
        s.style.cssText = `--fx:${L.shade.x}%;--fy:${L.shade.y}%;` +
                          `--fw:${L.shade.w}%;--fh:${L.shade.h}%`;
        el.appendChild(s);
      }

      // expression sheets are stacked and cross-faded on opacity; swapping .src
      // would flash while the new bitmap decodes, which ruins a 95ms blink
      const file = (L.variants && L.variants[variant]) || L.file;
      const sheets = L.faces || { base: file };
      const imgs = {};
      Object.entries(sheets).forEach(([name, file], k) => {
        const im = document.createElement('img');
        im.src = 'assets/room/' + file;
        im.alt = '';
        im.width = 1672; im.height = 941;
        im.dataset.face = name;
        if (i === 0 && k === 0) im.fetchPriority = 'high';
        im.style.cssText = `--sx:${L.sx};--sy:${L.sy};--tx:${L.tx};--ty:${L.ty};` +
                           `opacity:${name === 'base' ? 1 : 0}`;
        el.appendChild(im);
        imgs[name] = im;
      });
      camera.appendChild(el);

      const rec = { def: L, el, imgs, img: imgs.base, face: 'base',
                    z: zOf(L.par), par: L.par, s: 1 };
      // base stays fully opaque forever and the variants stack ON TOP of it.
      // Cross-fading base out instead would leave both sheets semi-transparent
      // mid-swap, letting the room show through — that reads as a flicker.
      rec.setFace = (name) => {
        if (!imgs[name] || rec.face === name) return;
        for (const n in imgs) {
          if (n !== 'base') imgs[n].style.opacity = n === name ? '1' : '0';
        }
        rec.face = name;
      };
      rec.ready = () => Promise.all(
        Object.values(imgs).map(im => (im.decode ? im.decode() : Promise.resolve())
          .catch(() => {})));
      made.push(rec);

      if (L.speech) {
        const sl = document.createElement('div');
        sl.className = 'layer hs-layer';
        sl.dataset.id = L.id + '-speech';
        sl.style.setProperty('--delay', '1.6s');
        sl.innerHTML =
          `<div class="speech" style="left:${L.speech.x}%;top:${L.speech.y}%">` +
          `<button class="speech-body" type="button" aria-live="polite"></button></div>`;
        camera.appendChild(sl);
        made.push({ def: L, el: sl, z: zOf(L.par), par: L.par, s: 1, pin: true });
      }

      // pins ride at their prop's depth, in their own layer so the counter-scale
      // that keeps the chrome a constant on-screen size stays isolated
      // a pin may carry `when` of its own, so a prop that exists in both states
      // can still hide a hotspot that only belongs to one of them
      const pins = (L.pins || (L.pin ? [L.pin] : []))
        .filter(p => !p.when || now === 'all' || p.when === now);
      if (pins.length) {
        const pl = document.createElement('div');
        pl.className = 'layer hs-layer';
        pl.dataset.id = L.id + '-pin';
        pl.style.setProperty('--delay', (0.9 + i * 0.1).toFixed(2) + 's');
        // dot + caption are ONE button: the caption is always readable and the
        // hit area is big enough to catch even though the pin drifts with parallax
        pl.innerHTML = pins.map((p, j) =>
          `<div class="hotspot${p.hidden ? ' is-hidden' : ''}` +
          `${p.beacon ? ' is-beacon' : ''}" ` +
          `style="left:${p.x}%;top:${p.y}%">` +
          `<button class="hotspot-dot" data-goto="${p.goto}" ` +
          `style="--ping:${(j * 0.45).toFixed(2)}s" aria-label="${p.aria || p.label}"` +
          `${p.hidden ? ' tabindex="-1"' : ''}>` +
          `<i class="dot"></i>` +
          `${p.hidden ? '' : `<span class="cap">${p.label}</span>`}` +
          `</button></div>`).join('');
        camera.appendChild(pl);
        made.push({ def: L, el: pl, z: zOf(L.par), par: L.par, s: 1, pin: true });
      }
    });

    const P = data.perspective || 2000;
    for (const L of made) {
      L.s = (P - L.z) / P;
      L.el.querySelectorAll('.hotspot,.speech')
        .forEach(h => h.style.setProperty('--cs', 1 / L.s));
      place(L, 0, 0);
    }
    root.style.perspective = P + 'px';
    return made;
  }

  function place(L, px, py) {
    L.el.style.transform =
      `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, ${L.z}px) ` +
      `scale(${L.s.toFixed(4)})`;
  }

  /* Drives camera + per-layer travel. Returns a handle so the tuner can freeze
     motion and re-place layers after an edit. */
  function animate(root, layers, data, opts) {
    opts = opts || {};
    const camera = root.querySelector('.camera');
    const AMP_X = (data.amp && data.amp.x) || 58;
    const AMP_Y = (data.amp && data.amp.y) || 30;
    const ZOOM = (data.scroll && data.scroll.zoom) || 0;
    const LIFT = (data.scroll && data.scroll.lift) || 0;

    let tx = 0, ty = 0, cx = 0, cy = 0, scrollP = 0, curScroll = 0;
    let fx = 50, fy = 50, raf = 0, frozen = !!opts.frozen;

    const fit = () => {
      const R = 1.7768;
      fx = innerHeight * R > innerWidth + 1 ? 46 : 50;
      fy = innerWidth / R > innerHeight + 1 ? 43 : 50;
      if (frozen) camera.style.transform = `translate(${-fx}%, ${-fy}%)`;
    };
    addEventListener('resize', fit, { passive: true });
    fit();

    const onMove = (e) => {
      if (frozen || e.pointerType === 'touch') return;
      tx = (e.clientX / innerWidth - .5) * 2;
      ty = (e.clientY / innerHeight - .5) * 2;
    };
    const onLeave = () => { tx = 0; ty = 0; };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerleave', onLeave, { passive: true });

    const onScroll = () => {
      scrollP = Math.min(1, scrollY / Math.max(1, innerHeight));
      if (opts.onScroll) opts.onScroll(scrollY);
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const frame = () => {
      cx += (tx - cx) * .055;
      cy += (ty - cy) * .055;
      curScroll += (scrollP - curScroll) * .1;
      camera.style.transform =
        `translate(${-fx}%, ${-fy}%)` +
        ` translate3d(0, ${(curScroll * LIFT).toFixed(2)}px, ${(curScroll * ZOOM).toFixed(2)}px)` +
        ` rotateY(${(cx * -1.5).toFixed(3)}deg) rotateX(${(cy * .9).toFixed(3)}deg)`;
      for (const L of layers) place(L, -cx * AMP_X * L.par, -cy * AMP_Y * L.par);
      raf = requestAnimationFrame(frame);
    };

    const start = () => { if (!raf && !frozen) raf = requestAnimationFrame(frame); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    if (frozen) {
      for (const L of layers) place(L, 0, 0);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else start();
    });

    return {
      freeze(on) {
        frozen = on;
        if (on) {
          stop();
          tx = ty = cx = cy = 0;
          camera.style.transform = `translate(${-fx}%, ${-fy}%)`;
          for (const L of layers) place(L, 0, 0);
        } else start();
      },
      refit: fit,
      place
    };
  }

  /* Re-apply one layer's numbers without rebuilding the DOM (tuner hot path). */
  function apply(rec, def, P) {
    rec.par = def.par;
    rec.z = zOf(def.par);
    rec.s = ((P || 2000) - rec.z) / (P || 2000);
    rec.el.querySelectorAll('.hotspot,.speech')
      .forEach(h => h.style.setProperty('--cs', 1 / rec.s));
    if (rec.imgs) {
      Object.entries(rec.imgs).forEach(([name, im]) => {
        im.style.cssText = `--sx:${def.sx};--sy:${def.sy};--tx:${def.tx};--ty:${def.ty};` +
                           `opacity:${name === rec.face ? 1 : 0}`;
      });
    }
    const pins = def.pins || (def.pin ? [def.pin] : []);
    rec.el.querySelectorAll('.hotspot').forEach((h, j) => {
      if (pins[j]) { h.style.left = pins[j].x + '%'; h.style.top = pins[j].y + '%'; }
    });
    const sp = rec.el.querySelector('.speech');
    if (sp && def.speech) { sp.style.left = def.speech.x + '%'; sp.style.top = def.speech.y + '%'; }
    const shade = rec.el.querySelector('.foot-shade');
    if (shade && def.shade) {
      shade.style.cssText = `--fx:${def.shade.x}%;--fy:${def.shade.y}%;` +
                            `--fw:${def.shade.w}%;--fh:${def.shade.h}%`;
    }
    place(rec, 0, 0);
  }

  function whenLoaded(root, cb, timeout) {
    const imgs = [...root.querySelectorAll('.camera img')];
    let n = 0, done = false;
    const finish = () => { if (!done) { done = true; cb(); } };
    const tick = () => { if (++n >= imgs.length) finish(); };
    imgs.forEach(im => {
      if (im.complete) tick();
      else { im.addEventListener('load', tick); im.addEventListener('error', tick); }
    });
    if (!imgs.length) finish();
    setTimeout(finish, timeout || 6000);
    return { count: () => n, total: imgs.length };
  }

  return { build, animate, apply, place, whenLoaded, zOf, Z_SPREAD, mode, jstHour, roomVariant };
})();
