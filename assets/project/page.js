/*
  Copyright (c) 2026 Jungseob Lee. All Rights Reserved.
  Shared behavior for the paper project pages:
  math typesetting, figure zoom, wide tables, BibTeX copy, and the list of other project pages.
*/
(function () {
  'use strict';

  /* ---------- Math ---------- */

  // Formulas are written as TeX between \( \) and \[ \]. If the typesetting
  // library did not load, the TeX source stays readable as plain text.
  if (window.katex && typeof window.renderMathInElement === 'function') {
    try {
      window.renderMathInElement(document.body, {
        delimiters: [
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false }
        ],
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        throwOnError: false
      });
    } catch (err) {
      // The rest of the page must keep working without typeset math.
    }
  }

  /* ---------- Figure zoom ---------- */

  var dialog = null;
  var dialogImg = null;

  function buildDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.setAttribute('aria-label', 'Enlarged figure');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'lightbox-close';
    close.setAttribute('aria-label', 'Close');
    var svgNS = 'http://www.w3.org/2000/svg';
    var cross = document.createElementNS(svgNS, 'svg');
    cross.setAttribute('viewBox', '0 0 24 24');
    cross.setAttribute('aria-hidden', 'true');
    var strokes = document.createElementNS(svgNS, 'path');
    strokes.setAttribute('d', 'M6 6l12 12M18 6L6 18');
    cross.appendChild(strokes);
    close.appendChild(cross);
    close.addEventListener('click', function () { dialog.close(); });

    var stage = document.createElement('div');
    stage.className = 'lightbox-stage';
    dialogImg = document.createElement('img');
    dialogImg.tabIndex = 0;
    stage.appendChild(dialogImg);

    // A click on the picture switches between fit-to-screen and full size.
    // A click anywhere else closes the view.
    stage.addEventListener('click', function (e) {
      if (e.target === dialogImg) {
        var actual = dialog.classList.toggle('actual');
        dialogImg.style.cursor = actual ? 'zoom-out' : 'zoom-in';
      } else {
        dialog.close();
      }
    });

    dialogImg.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dialogImg.click();
      }
    });

    dialog.addEventListener('close', function () {
      dialog.classList.remove('actual');
      dialogImg.removeAttribute('src');
    });

    dialog.appendChild(close);
    dialog.appendChild(stage);
    document.body.appendChild(dialog);
  }

  function openFigure(link) {
    if (!dialog) buildDialog();
    var thumb = link.querySelector('img');
    dialogImg.src = link.getAttribute('href');
    dialogImg.alt = thumb ? thumb.alt : '';
    dialogImg.style.cursor = 'zoom-in';
    dialog.showModal();
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[data-zoom]') : null;
    if (!link) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (typeof HTMLDialogElement !== 'function') return;
    e.preventDefault();
    openFigure(link);
  });

  /* ---------- Wide tables ---------- */

  // The stylesheet can only guess from the window width whether a table
  // scrolls sideways. Measuring settles it, so the hint under a table and
  // its pinned first column follow what the table really does.
  var tableBlocks = Array.prototype.slice.call(document.querySelectorAll('.table-block'));

  function measureTables() {
    tableBlocks.forEach(function (block) {
      var wrap = block.querySelector('.table-wrap');
      if (!wrap) return;
      var scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
      block.classList.toggle('scrolls', scrolls);
      block.classList.toggle('fits', !scrolls);
    });
  }

  if (tableBlocks.length) {
    measureTables();
    window.addEventListener('resize', measureTables);
    window.addEventListener('load', measureTables);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureTables);
    }
  }

  /* ---------- BibTeX copy ---------- */

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function selectText(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function flash(button, label) {
    var original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = label;
    button.classList.toggle('done', label === 'Copied');
    window.clearTimeout(button._timer);
    button._timer = window.setTimeout(function () {
      button.textContent = original;
      button.classList.remove('done');
    }, 1800);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    button.addEventListener('click', function () {
      var source = document.getElementById(button.dataset.copy);
      if (!source) return;
      var text = source.textContent.replace(/^\s+|\s+$/g, '') + '\n';
      // Last resort: leave the entry selected so that Ctrl+C copies it.
      function byHand() {
        if (fallbackCopy(text)) {
          flash(button, 'Copied');
        } else {
          selectText(source);
          flash(button, 'Press Ctrl+C');
        }
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { flash(button, 'Copied'); }, byHand);
      } else {
        byHand();
      }
    });
  });

  /* ---------- Other project pages ---------- */

  // The homepage publication list is the single source: every entry in
  // data.json with a site-relative "project" link shows up here, except the
  // current page.
  var more = document.getElementById('more');
  var list = more ? more.querySelector('.more-list') : null;

  function slugOf(path) {
    var parts = String(path).split('/').filter(function (s) { return s && s !== 'index.html'; });
    return parts.length ? parts[parts.length - 1].toLowerCase() : '';
  }

  if (more && list && window.fetch) {
    var here = slugOf(window.location.pathname);
    fetch('../data.json')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('data')); })
      .then(function (data) {
        var papers = (data && data.papers) || [];
        var count = 0;
        papers.forEach(function (p) {
          var target = p && p.links && p.links.project;
          if (!target || /^[a-z]+:/i.test(target) || slugOf(target) === here) return;

          var item = document.createElement('li');
          var link = document.createElement('a');
          link.href = '../' + String(target).replace(/^\/+/, '');

          var title = document.createElement('span');
          title.className = 'more-title';
          title.textContent = p.title || '';

          var venue = document.createElement('span');
          venue.className = 'more-venue';
          venue.textContent = p.venue || '';

          link.appendChild(title);
          link.appendChild(venue);
          item.appendChild(link);
          list.appendChild(item);
          count += 1;
        });
        if (count) more.hidden = false;
      })
      .catch(function () { /* The section simply stays hidden. */ });
  }
})();
