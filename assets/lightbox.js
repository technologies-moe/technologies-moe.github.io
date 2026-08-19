/* lightbox.js — click any [data-full] to open the full-resolution sheet.
   Pages ship a small <img> (…-thumb.webp); the big file is only fetched
   when someone actually asks to zoom in. */
(() => {
  'use strict';
  const box = document.getElementById('lightbox');
  if (!box) return;

  const img = box.querySelector('img');
  const cap = box.querySelector('.cap');
  let opener = null;

  /* the rest of the page goes inert while the sheet is up, so Tab stays inside
     the dialog and the page behind is not announced */
  const seal = (on) => {
    for (const el of document.body.children) el.inert = on && el !== box;
  };

  const open = (btn) => {
    opener = btn;
    img.src = btn.dataset.full;
    img.alt = btn.dataset.alt || '';
    cap.textContent = btn.dataset.cap || '';
    box.classList.add('on');
    seal(true);
    document.body.style.overflow = 'hidden';
    box.querySelector('.close').focus();
  };

  const close = () => {
    box.classList.remove('on');
    seal(false);
    document.body.style.overflow = '';
    // drop the bitmap so a long gallery session does not pile up in memory
    img.removeAttribute('src');
    if (opener) { opener.focus(); opener = null; }
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-full]');
    if (btn) { open(btn); return; }
    // any click on the backdrop or the close button dismisses
    if (e.target.closest('#lightbox') && !e.target.closest('#lightbox img')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box.classList.contains('on')) close();
  });
})();
