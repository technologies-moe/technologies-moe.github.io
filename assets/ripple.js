/* ripple.js — WebGL water ripples over a still image.
 *
 * Mark up an <img> inside a positioned box:
 *   <img src="…" data-ripple data-ripple-origin="0.54,0.42">
 *
 * The image stays in the DOM as the layout box, the alt text and the
 * fallback: if WebGL is missing, the pointer is coarse-free, or the visitor
 * asked for reduced motion, nothing happens and the picture just sits there.
 * Only once the shader is live does the <img> fade out behind the canvas.
 */
(() => {
  'use strict';

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){
      vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5);
      gl_Position = vec4(aPos, 0., 1.);
    }`;

  // MAX_DROPS is baked into the shader because GLSL ES 1.0 needs a constant
  // loop bound; the JS ring buffer below has to agree with it.
  const MAX_DROPS = 8;

  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uTime;
    uniform float uAspect;
    uniform vec4  uDrops[${MAX_DROPS}];   // xy = origin uv, z = birth, w = strength

    const float LIFE  = 2.6;   // seconds a ring stays alive
    const float SPEED = 0.42;  // how fast the ring travels outward
    const float FREQ  = 46.0;  // waves packed into the ring
    const float BAND  = 8.5;   // how tight the ring is
    const float AMP   = 0.018; // uv displacement at full strength

    void main(){
      vec2  grad   = vec2(0.);
      float height = 0.;

      for (int i = 0; i < ${MAX_DROPS}; i++){
        vec4  d   = uDrops[i];
        float age = uTime - d.z;
        if (d.w <= 0. || age < 0. || age > LIFE) continue;

        // correct for the canvas aspect so rings stay circular, not oval
        vec2  v    = (vUv - d.xy) * vec2(uAspect, 1.);
        float dist = length(v);
        float r    = age * SPEED;

        float ring  = exp(-BAND * BAND * (dist - r) * (dist - r));
        float decay = 1. - age / LIFE;
        float w     = sin((dist - r) * FREQ)
                    * ring * decay * decay
                    / (1. + dist * 3.)      // energy drops off with distance
                    * d.w;

        grad   += normalize(v + 1e-5) * w;
        height += w;
      }

      vec3 col = texture2D(uTex, vUv + grad * AMP).rgb;
      col += height * .11;                  // cheap specular, sells the water
      gl_FragColor = vec4(col, 1.);
    }`;

  const compile = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('ripple: shader failed', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };

  function boot(img) {
    const host = img.parentElement;
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0',
      width: '100%', height: '100%',
      display: 'block', opacity: '0',
      transition: 'opacity .6s ease',
      pointerEvents: 'none'
    });

    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power'
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('ripple: link failed', gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // the source is NPOT, so clamp + linear and no mipmaps is the only legal combo
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);

    const uTime   = gl.getUniformLocation(prog, 'uTime');
    const uAspect = gl.getUniformLocation(prog, 'uAspect');
    const uDrops  = gl.getUniformLocation(prog, 'uDrops');
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);

    const drops = new Float32Array(MAX_DROPS * 4);
    let next = 0;
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const addDrop = (x, y, strength) => {
      const o = next * 4;
      drops[o] = x; drops[o + 1] = y; drops[o + 2] = now(); drops[o + 3] = strength;
      next = (next + 1) % MAX_DROPS;
    };

    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(host.clientWidth  * dpr));
      const h = Math.max(1, Math.round(host.clientHeight * dpr));
      if (w === W && h === H) return;
      W = canvas.width = w; H = canvas.height = h;
      gl.viewport(0, 0, W, H);
      gl.uniform1f(uAspect, W / H);
    };

    host.appendChild(canvas);
    resize();
    addEventListener('resize', resize, { passive: true });

    /* ---------- interaction ---------- */
    const uvFromEvent = (e) => {
      const r = host.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    };
    let lastMove = 0;
    host.addEventListener('pointermove', (e) => {
      // a drop per frame would swamp the ring buffer and wash the image out
      if (performance.now() - lastMove < 110) return;
      lastMove = performance.now();
      const [x, y] = uvFromEvent(e);
      addDrop(x, y, .5);
    }, { passive: true });
    host.addEventListener('pointerdown', (e) => {
      const [x, y] = uvFromEvent(e);
      addDrop(x, y, 1.4);
    }, { passive: true });

    /* ---------- idle pulse from the fingertip ---------- */
    const parsed = (img.dataset.rippleOrigin || '').split(',').map(Number);
    const origin = parsed.length === 2 && parsed.every(n => isFinite(n)) ? parsed : null;
    let nextIdle = 1.2;

    /* ---------- loop, only while on screen ---------- */
    let visible = false, raf = 0;
    const frame = () => {
      raf = 0;
      if (!visible) return;
      resize();
      const t = now();
      if (origin && t >= nextIdle) {
        addDrop(origin[0], origin[1], .62);
        nextIdle = t + 2.4 + Math.random() * 1.8;
      }
      gl.uniform1f(uTime, t);
      gl.uniform4fv(uDrops, drops);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }, { threshold: 0 }).observe(host);

    // hand over from the <img> only once a real frame is on screen
    requestAnimationFrame(() => {
      canvas.style.opacity = '1';
      img.style.transition = 'opacity .6s ease';
      img.style.opacity = '0';
      host.style.cursor = 'crosshair';
      canvas.style.pointerEvents = 'none';
    });
  }

  const start = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('img[data-ripple]').forEach((img) => {
      if (img.complete && img.naturalWidth) boot(img);
      else img.addEventListener('load', () => boot(img), { once: true });
    });
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start);
  else start();
})();
