/*
  Copyright (c) 2026 Jungseob Lee. All Rights Reserved.
  Replay of decoding runs on the paper project pages.
  Every lane is one method writing its output for the same prompt, and it
  advances at the time of each committed round in the page's data.
*/
(function () {
  'use strict';

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Characters of finished output kept in a lane, far more than its lines show.
  var KEEP = 2000;

  function seconds(ms) {
    return (ms / 1000).toFixed(2) + ' s';
  }

  // Tokens known at time t as [start of the latest round, end of it].
  // A decoder timed from the end of the prefill holds its first token when
  // the clock starts. A run timed from the request says so with first = 0.
  function roundAt(rec, t) {
    var lo = 0;
    var hi = rec.t.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (rec.t[mid] <= t) lo = mid + 1; else hi = mid;
    }
    var first = rec.first === undefined ? 1 : rec.first;
    function at(i) {
      if (i < 0) return 0;
      if (i === 0) return first;
      return Math.min(rec.n, rec.c ? rec.c[i - 1] : i + first);
    }
    if (t >= rec.end) return [at(lo - 1), rec.n];
    return [at(lo - 1), at(lo)];
  }

  function setup(root) {
    var source = root.querySelector('script[type="application/json"]');
    var data = null;
    try { data = JSON.parse(source.textContent); } catch (err) { data = null; }
    if (!data || !data.runs || !data.runs.length) return;

    var laneEls = Array.prototype.slice.call(root.querySelectorAll('.lane'));
    var promptEl = root.querySelector('.race-prompt span');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-run]'));
    var rateBtn = root.querySelector('.race-rate');
    var playBtn = root.querySelector('.race-replay');

    // Runs given as counts of decoder steps are read in that unit: the clock
    // ticks once for each step instead of running in seconds.
    var tick = data.tick || null;

    function reading(ms) {
      if (!tick) return seconds(ms);
      var steps = Math.floor(ms / tick.ms + 1e-6);
      return steps + ' ' + (steps === 1 ? tick.one : tick.unit);
    }

    var lanes = [];
    var total = 1;
    var shared = true;
    var oursEnd = 0;
    var lastEnd = 0;

    // A negative clock is the state before the first start: nothing written yet.
    var clock = -1;
    var rate = 1;
    var playing = false;
    var started = false;
    var visible = true;
    var onPaper = false;
    var stamp = 0;
    var handle = 0;

    function load(index) {
      var run = data.runs[index];
      total = run.total;
      // Lanes that write different amounts have no common denominator, so
      // each one counts its own tokens.
      shared = run.lanes.every(function (rec) { return rec.n === total; });
      oursEnd = 0;
      lastEnd = 0;

      lanes = run.lanes.map(function (rec, j) {
        var el = laneEls[j];
        // A run given as counts and rates alone has no output to write.
        var pieces = run.texts ? run.texts[rec.text || 0] : null;
        // The inset is a few lines deep, so it draws no empty lines: a line
        // break that follows a line break adds nothing to the lane's text.
        var full = '';
        var edge = [0];
        for (var k = 0; pieces && k < rec.n; k += 1) {
          var piece = pieces[k].replace(/\n+/g, '\n');
          if (piece.charAt(0) === '\n' && (full === '' || full.charAt(full.length - 1) === '\n')) {
            piece = piece.slice(1);
          }
          full += piece;
          edge.push(full.length);
        }

        var box = pieces ? el.querySelector('.lane-text') : null;
        var past = null;
        var fresh = null;
        if (box) {
          var body = document.createElement('span');
          past = document.createTextNode('');
          fresh = document.createElement('mark');
          body.appendChild(past);
          body.appendChild(fresh);
          box.textContent = '';
          box.appendChild(body);
        }

        el.querySelector('.lane-x b').textContent = rec.x + '×';
        var meta = el.querySelectorAll('.lane-meta span');
        meta[0].textContent = rec.meta[0];
        meta[1].textContent = rec.meta[1];

        var ours = el.classList.contains('ours');
        if (ours) oursEnd = rec.end;
        lastEnd = Math.max(lastEnd, rec.end);

        // A headline count holds the number alone, with its unit set beside it.
        var figure = el.querySelector('.lane-count b');

        return {
          el: el, rec: rec, ours: ours, full: full, edge: edge, past: past, fresh: fresh,
          track: el.querySelector('.lane-track'),
          count: figure || el.querySelector('.lane-count'), bare: !!figure,
          time: el.querySelector('.lane-time'),
          shown: -1, done: null, label: ''
        };
      });

      // A lane that writes less than the scale gets a rail of its own length.
      // Where each baseline stands when the proposed method finishes.
      lanes.forEach(function (lane) {
        var short = lane.rec.n !== total;
        lane.track.classList.toggle('short', short);
        if (short) lane.track.style.setProperty('--n', (lane.rec.n / total).toFixed(4));
        else lane.track.style.removeProperty('--n');
        if (!lane.ours) {
          lane.track.style.setProperty('--k', (roundAt(lane.rec, oursEnd)[1] / total).toFixed(4));
        }
      });
    }

    // The markup holds the first run's prompt, with its formulas typeset.
    // Another run brings its prompt as text, and a widget marked for math has
    // the TeX between dollar signs typeset the same way.
    function show(prompt) {
      if (!promptEl) return;
      var line = document.createElement('span');
      line.textContent = prompt;
      promptEl.textContent = '';
      promptEl.appendChild(line);
      if (!root.hasAttribute('data-math') || typeof window.renderMathInElement !== 'function') return;
      try {
        window.renderMathInElement(line, {
          delimiters: [
            { left: '$$', right: '$$', display: false },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      } catch (err) {
        // The TeX source stays readable as plain text.
      }
    }

    // The whole picture is a function of the clock, so any moment can be drawn
    // directly: the start, the instant the proposed method finishes, the end.
    function draw(t) {
      root.classList.toggle('passed', t >= oursEnd);
      lanes.forEach(function (lane) {
        var rec = lane.rec;
        var done = t >= rec.end;
        var span = t < 0 ? [0, 0] : roundAt(rec, t);
        var to = span[1];
        if (to !== lane.shown || done !== lane.done) {
          lane.shown = to;
          lane.done = done;
          if (lane.past) {
            var from = done ? to : span[0];
            var head = lane.edge[from];
            // Only the last lines are in view. A long output keeps its tail,
            // cut at a line start, where the cut cannot move a line break.
            var cut = head > KEEP ? lane.full.lastIndexOf('\n', head - KEEP) + 1 : 0;
            lane.past.data = lane.full.slice(cut, head);
            lane.fresh.textContent = lane.full.slice(lane.edge[from], lane.edge[to]);
          }
          lane.track.style.setProperty('--f', (to / total).toFixed(4));
          var tokens = to.toLocaleString('en-US');
          lane.count.textContent = lane.bare ? tokens : shared && !tick ? to + ' / ' + total + ' tokens' : tokens + ' tokens';
          lane.el.classList.toggle('done', done);
        }
        var label = reading(Math.max(0, Math.min(t, rec.end)));
        if (label !== lane.label) {
          lane.label = label;
          lane.time.textContent = label;
        }
      });
    }

    function label(text) {
      if (playBtn) playBtn.textContent = text;
    }

    // Frames are requested only while a run is in progress and on screen, so
    // a widget scrolled out of view costs nothing.
    function schedule() {
      if (playing && visible && !handle) handle = window.requestAnimationFrame(step);
    }

    function step(now) {
      handle = 0;
      if (!playing || !visible) return;
      // A long gap means the tab was in the background. The run waits there
      // instead of jumping ahead.
      var dt = Math.min(now - stamp, 100);
      stamp = now;
      if (!onPaper) {
        if (dt > 0) clock += dt * rate;
        draw(clock);
        if (clock >= lastEnd) {
          playing = false;
          root.classList.add('finished');
          label('Replay');
          return;
        }
      }
      schedule();
    }

    function play() {
      root.classList.remove('finished');
      label('Pause');
      clock = 0;
      playing = true;
      started = true;
      stamp = window.performance.now();
      draw(0);
      schedule();
    }

    function pause() {
      playing = false;
      label('Resume');
    }

    function resume() {
      label('Pause');
      playing = true;
      stamp = window.performance.now();
      schedule();
    }

    // One button follows the run: it starts it, holds it, and starts it over.
    function toggle() {
      if (playing) pause();
      else if (started && clock >= 0 && clock < lastEnd) resume();
      else play();
    }

    // The still picture: the instant the proposed method writes its last token.
    function rest() {
      playing = false;
      started = false;
      clock = oursEnd;
      draw(clock);
    }

    function paper(on) {
      onPaper = on;
      stamp = window.performance.now();
      draw(on && clock < oursEnd ? oursEnd : clock);
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (other) { other.setAttribute('aria-pressed', String(other === tab)); });
        load(index);
        show(data.runs[index].prompt);
        play();
      });
    });

    // The rate button names the playback rate it holds while pressed.
    // Released, the replay runs in real time.
    function pace() {
      var on = !!rateBtn && rateBtn.getAttribute('aria-pressed') === 'true';
      rate = on ? Number(rateBtn.getAttribute('data-rate')) || 1 : 1;
    }

    if (rateBtn) {
      rateBtn.addEventListener('click', function () {
        rateBtn.setAttribute('aria-pressed', String(rateBtn.getAttribute('aria-pressed') !== 'true'));
        pace();
      });
    }

    if (playBtn) playBtn.addEventListener('click', toggle);

    load(0);
    pace();
    label('Play');

    if (reduce) {
      rest();
    } else {
      draw(-1);
    }

    if ('IntersectionObserver' in window) {
      // The run starts by itself once most of the widget is on screen, so the
      // lanes below the first one are in view when it begins. On a screen
      // shorter than the widget, filling most of the screen counts instead.
      new window.IntersectionObserver(function (entries) {
        var entry = entries[entries.length - 1];
        var shown = entry.intersectionRect.height >=
          0.6 * Math.min(entry.boundingClientRect.height, window.innerHeight);
        visible = entry.isIntersecting;
        if (!visible) return;
        if (!started && !reduce && shown) {
          play();
        } else {
          stamp = window.performance.now();
          schedule();
        }
      }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6] }).observe(root);
    } else if (!reduce) {
      play();
    }

    window.addEventListener('beforeprint', function () { paper(true); });
    window.addEventListener('afterprint', function () { paper(false); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-race]'), setup);
})();
