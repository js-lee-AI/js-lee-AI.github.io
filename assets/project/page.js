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
  // current page. The figure, the one-sentence summary and the two colors of
  // a card come from the card data the homepage draws the same papers from.
  var more = document.getElementById('more');
  var mount = more ? more.querySelector('.more-list') : null;
  var PER_PAGE = 4;
  var NUMBERS = 5;

  function folderOf(path) {
    var parts = String(path).split('/').filter(function (s) { return s && s !== 'index.html'; });
    return parts.length ? parts[parts.length - 1] : '';
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function getJson(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(url)); });
  }

  // The order of the homepage: published papers by year and then by
  // citations, followed by the preprints from the newest down.
  function others(papers, here) {
    var list = [];
    papers.forEach(function (p, at) {
      var target = p && p.links && p.links.project;
      if (!target || /^[a-z]+:/i.test(target) || folderOf(target).toLowerCase() === here) return;
      list.push({ paper: p, at: at });
    });
    list.sort(function (a, b) {
      var p = a.paper;
      var q = b.paper;
      return (p.preprint ? 1 : 0) - (q.preprint ? 1 : 0) ||
        (q.year || 0) - (p.year || 0) ||
        (p.preprint ? (q.id || 0) - (p.id || 0) : (q.citations || 0) - (p.citations || 0)) ||
        a.at - b.at;
    });
    return list.map(function (entry) { return entry.paper; });
  }

  function buildCard(p, cards) {
    var folder = folderOf(p.links.project);
    var shown = Object.prototype.hasOwnProperty.call(cards, folder) ? cards[folder] : null;
    var card = make('li', 'more-card');

    if (shown && shown.accent) {
      card.style.setProperty('--pa', shown.accent[0]);
      card.style.setProperty('--pb', shown.accent[1]);
    }

    if (shown && shown.figure) {
      var fig = make('div', 'more-fig');
      var img = document.createElement('img');
      img.alt = '';
      img.width = shown.figure.w;
      img.height = shown.figure.h;
      img.loading = 'lazy';
      // The file is asked for when its page of cards is about to be shown.
      img.setAttribute('data-src', '../' + shown.figure.src);
      // A figure that does not load leaves a card of text.
      img.addEventListener('error', function () {
        if (fig.parentNode) fig.parentNode.removeChild(fig);
      });
      fig.appendChild(img);
      card.appendChild(fig);
    }

    var body = make('div', 'more-body');

    if (p.venue) {
      var top = make('p', 'more-top');
      top.appendChild(make('span', 'more-tag', p.venue));
      // The year is written only when the venue does not already say it.
      if (p.year && String(p.venue).indexOf(String(p.year)) < 0) {
        top.appendChild(make('span', 'more-year', p.year));
      }
      body.appendChild(top);
    }

    var title = make('h3', 'more-title');
    var link = make('a');
    link.href = '../' + String(p.links.project).replace(/^\/+/, '');
    if (shown && shown.title) {
      link.innerHTML = shown.title;
    } else {
      link.textContent = p.title || '';
    }
    if (shown && shown.icon) {
      var icon = make('img', 'more-icon');
      icon.alt = '';
      icon.width = shown.icon.w;
      icon.height = shown.icon.h;
      icon.src = '../' + shown.icon.src;
      link.insertBefore(icon, link.firstChild);
    }
    title.appendChild(link);
    body.appendChild(title);

    if (shown && shown.summary) {
      var summary = make('p', 'more-sum');
      summary.innerHTML = shown.summary;
      body.appendChild(summary);
    }

    card.appendChild(body);
    return card;
  }

  function arrow(label, path) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var button = make('button', 'more-step');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    var icon = document.createElementNS(svgNS, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    var stroke = document.createElementNS(svgNS, 'path');
    stroke.setAttribute('d', path);
    icon.appendChild(stroke);
    button.appendChild(icon);
    return button;
  }

  function buildDeck(papers, cards) {
    var deck = make('div', 'more-deck');
    var pages = [];
    papers.forEach(function (p, i) {
      if (i % PER_PAGE === 0) pages.push(deck.appendChild(make('ul', 'more-page')));
      pages[pages.length - 1].appendChild(buildCard(p, cards));
    });

    // Rows of the fullest page: two cards to a row, one on a small screen.
    var most = Math.min(PER_PAGE, papers.length);
    deck.style.setProperty('--rows-wide', Math.ceil(most / 2));
    deck.style.setProperty('--rows-narrow', most);

    function load(k) {
      if (!pages[k]) return;
      Array.prototype.forEach.call(pages[k].querySelectorAll('img[data-src]'), function (img) {
        img.src = img.getAttribute('data-src');
        img.removeAttribute('data-src');
      });
    }

    pages[0].classList.add('on');
    load(0);
    mount.parentNode.replaceChild(deck, mount);
    if (pages.length < 2) return;

    var current = 0;
    var pager = make('nav', 'more-pager');
    pager.setAttribute('aria-label', 'Pages of projects');
    var prev = arrow('Previous page', 'M15 5l-7 7 7 7');
    var next = arrow('Next page', 'M9 5l7 7-7 7');
    var status = make('p', 'more-status');
    status.setAttribute('aria-live', 'polite');

    var numbers = pages.map(function (page, i) {
      var button = make('button', '', i + 1);
      button.type = 'button';
      button.setAttribute('aria-label', 'Page ' + (i + 1));
      button.addEventListener('click', function () { show(i); });
      return button;
    });

    // The pages next to the current one are fetched ahead of a turn, so a
    // turn does not open on empty figures.
    function warm() {
      load(current - 1);
      load(current + 1);
    }

    function draw() {
      var held = document.activeElement;
      pages.forEach(function (page, i) { page.classList.toggle('on', i === current); });
      load(current);
      // With many pages only the numbers around the current one are shown.
      var first = Math.max(0, Math.min(current - Math.floor(NUMBERS / 2), pages.length - NUMBERS));
      numbers.forEach(function (button, i) {
        button.hidden = i < first || i >= first + NUMBERS;
        if (i === current) {
          button.setAttribute('aria-current', 'page');
        } else {
          button.removeAttribute('aria-current');
        }
      });
      prev.disabled = current === 0;
      next.disabled = current === pages.length - 1;
      // An arrow that has just run out cannot keep the focus.
      if ((held === prev && prev.disabled) || (held === next && next.disabled)) numbers[current].focus();
    }

    function show(k) {
      k = Math.max(0, Math.min(pages.length - 1, k));
      if (k === current) return;
      deck.style.setProperty('--from', k > current ? '0.75rem' : '-0.75rem');
      deck.classList.add('turned');
      current = k;
      draw();
      warm();
      status.textContent = 'Page ' + (current + 1) + ' of ' + pages.length;
      // A page taller than the window, as on a phone, starts again from its first card.
      if (deck.getBoundingClientRect().top < -0.25 * window.innerHeight) deck.scrollIntoView();
    }

    prev.addEventListener('click', function () { show(current - 1); });
    next.addEventListener('click', function () { show(current + 1); });
    pager.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      show(current + (e.key === 'ArrowRight' ? 1 : -1));
      numbers[current].focus();
    });

    pager.appendChild(prev);
    numbers.forEach(function (button) { pager.appendChild(button); });
    pager.appendChild(next);
    deck.parentNode.insertBefore(pager, deck.nextSibling);
    pager.parentNode.insertBefore(status, pager.nextSibling);
    draw();

    // The second page is fetched when the buttons are about to come into
    // view, and not for a reader who never scrolls this far.
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries, observer) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        observer.disconnect();
        warm();
      }, { rootMargin: '300px 0px' }).observe(pager);
    }
  }

  if (more && mount && window.fetch) {
    var here = folderOf(window.location.pathname).toLowerCase();
    Promise.all([
      getJson('../data.json'),
      // Without the card data the papers are still listed, as cards of text.
      getJson('../assets/project/cards.json').catch(function () { return {}; })
    ])
      .then(function (got) {
        var papers = others((got[0] && got[0].papers) || [], here);
        if (!papers.length) return;
        buildDeck(papers, (got[1] && typeof got[1] === 'object') ? got[1] : {});
        more.hidden = false;
      })
      .catch(function () { /* The section simply stays hidden. */ });
  }
})();
