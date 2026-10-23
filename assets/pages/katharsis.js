// katharsis.js: the behavior every Katharsis page shares. The page loads it
// in <head>, before the body draws, so a stored theme choice applies without
// a flash of the other theme. With no stored choice the page follows the OS
// setting through katharsis.css. scripts/katharsis-artifact.sh copies this
// file beside the pages on every page write.
//
// On a question page (`katharsis-artifact.sh ask`) it also builds a tab per
// question, marks the option the user picks, shows which questions a pick
// affects, and copies the picks in the form the drawer's send posts. README.md
// beside this file holds the markup contract. With scripts off, every question
// stays readable in page order.
//
// The script runs outside a browser too: with no `document` it only sets
// `KatharsisPage.answerLines`, so a test can build the copy text without one.
(function (global) {
  // answerLines: the text the copy button copies, one `Q12 a` line per
  // answered question, in page order, joined by newlines; '' when no question
  // holds a pick. It is the drawer's answerText for a pick with no note.
  function answerLines(questions) {
    var lines = [];
    for (var i = 0; i < questions.length; i++) {
      if (questions[i].letter) lines.push(questions[i].code + ' ' + questions[i].letter);
    }
    return lines.join('\n');
  }
  global.KatharsisPage = { answerLines: answerLines };
  if (typeof document === 'undefined') return;

  var KEY = 'katharsis-theme';
  var root = document.documentElement;
  var dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  // Storage can be blocked for file:// pages or in a private window.
  function stored() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function store(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) {}
  }
  function current() {
    var chosen = root.getAttribute('data-theme');
    if (chosen === 'light' || chosen === 'dark') return chosen;
    return dark && dark.matches ? 'dark' : 'light';
  }

  var choice = stored();
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice);

  function themeToggle() {
    var button = document.querySelector('[data-k-toggle]');
    if (!button) return;
    function label() {
      var next = current() === 'dark' ? 'light' : 'dark';
      button.textContent = next === 'dark' ? 'Dark' : 'Light';
      button.setAttribute('aria-label', 'Use the ' + next + ' theme');
    }
    button.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      store(next);
      label();
    });
    if (dark && dark.addEventListener) dark.addEventListener('change', label);
    label();
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  // The legacy copy path, for a browser that refuses the Clipboard API on a
  // file:// page.
  function legacyCopy(text) {
    try {
      var area = el('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (e) {
      return false;
    }
  }
  // A Clipboard API call that neither resolves nor rejects within a second,
  // as headless Chrome's does, falls back to the legacy path too.
  function copy(text, done) {
    var settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      done(ok);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { finish(true); }, function () { finish(legacyCopy(text)); });
        setTimeout(function () { finish(legacyCopy(text)); }, 1000);
        return;
      }
    } catch (e) {}
    finish(legacyCopy(text));
  }

  function questionPage() {
    var sections = document.querySelectorAll('section.k-q[id]');
    if (sections.length === 0) return;
    var byCode = {};
    var order = [];
    var picks = {};
    var tabs = {};
    each(sections, function (s) { byCode[s.id] = s; order.push(s.id); });
    function titleOf(code) {
      var t = byCode[code].getAttribute('data-title');
      return t ? code + ' ' + t : code;
    }

    // The tab strip, one tab per question, before the first question.
    var strip = el('div', 'k-tabs');
    strip.setAttribute('role', 'tablist');
    sections[0].parentNode.insertBefore(strip, sections[0]);
    order.forEach(function (code) {
      var s = byCode[code];
      var tab = el('button', 'k-tab');
      tab.type = 'button';
      tab.id = 'k-tab-' + code;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', code);
      tab.appendChild(el('span', 'k-tab-code', code));
      if (s.getAttribute('data-title')) tab.appendChild(el('span', 'k-tab-title', s.getAttribute('data-title')));
      tab.appendChild(el('span', 'k-tab-pick'));
      tab.appendChild(el('span', 'k-tab-flag'));
      tab.addEventListener('click', function () { select(code, false); });
      tab.addEventListener('keydown', function (e) {
        var i = order.indexOf(code);
        var to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? order.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        select(order[(to + order.length) % order.length], true);
      });
      strip.appendChild(tab);
      tabs[code] = tab;
      s.setAttribute('role', 'tabpanel');
      s.setAttribute('aria-labelledby', tab.id);
    });

    function select(code, focus) {
      order.forEach(function (c) {
        var on = c === code;
        byCode[c].hidden = !on;
        tabs[c].setAttribute('aria-selected', on ? 'true' : 'false');
        tabs[c].tabIndex = on ? 0 : -1;
      });
      if (focus) tabs[code].focus();
    }

    // Options: one pick per question, and a second click clears it. An
    // option's data-affects names the questions its pick bears on, and the
    // shell adds a link to each.
    each(sections, function (s) {
      each(s.querySelectorAll('.k-option[data-letter]'), function (opt) {
        opt.setAttribute('role', 'button');
        opt.tabIndex = 0;
        opt.setAttribute('aria-pressed', 'false');
        var affects = affected(opt, s.id);
        if (affects.length > 0) {
          var line = el('p', 'k-affects', 'Affects ');
          affects.forEach(function (code, i) {
            if (i > 0) line.appendChild(document.createTextNode(', '));
            var link = el('a', '', titleOf(code));
            link.href = '#' + code;
            line.appendChild(link);
          });
          opt.appendChild(line);
        }
        function toggle() {
          var letter = opt.getAttribute('data-letter');
          if (picks[s.id] === letter) delete picks[s.id];
          else picks[s.id] = letter;
          update();
        }
        opt.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('a')) return;
          toggle();
        });
        opt.addEventListener('keydown', function (e) {
          if (e.target !== opt || (e.key !== 'Enter' && e.key !== ' ')) return;
          e.preventDefault();
          toggle();
        });
      });
    });
    function affected(opt, own) {
      return (opt.getAttribute('data-affects') || '').split(/[\s,]+/).filter(function (code, i, all) {
        return code !== '' && code !== own && byCode[code] && all.indexOf(code) === i;
      });
    }

    // A link to another question's id switches to its tab.
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!link) return;
      var code = decodeURIComponent(link.getAttribute('href').slice(1));
      if (!byCode[code]) return;
      e.preventDefault();
      select(code, true);
    });

    var bar = document.querySelector('[data-k-answers]');
    var preview = document.querySelector('[data-k-preview]');
    var status = document.querySelector('[data-k-copied]');
    var button = document.querySelector('[data-k-copy]');
    function text() {
      return answerLines(order.map(function (code) { return { code: code, letter: picks[code] || '' }; }));
    }

    function update() {
      var flags = {};
      each(document.querySelectorAll('[data-k-notice]'), function (n) { n.parentNode.removeChild(n); });
      order.forEach(function (code) {
        each(byCode[code].querySelectorAll('.k-option[data-letter]'), function (opt) {
          var on = picks[code] === opt.getAttribute('data-letter');
          opt.setAttribute('aria-pressed', on ? 'true' : 'false');
          if (!on) return;
          affected(opt, code).forEach(function (target) {
            (flags[target] = flags[target] || []).push(code + ' ' + picks[code]);
          });
        });
        tabs[code].querySelector('.k-tab-pick').textContent = picks[code] || '';
      });
      order.forEach(function (code) {
        var flag = tabs[code].querySelector('.k-tab-flag');
        if (!flags[code]) {
          flag.textContent = '';
          flag.title = '';
          return;
        }
        flag.textContent = '\u2022';
        flag.title = 'Affected by ' + flags[code].join(', ');
        var notice = el('p', 'k-notice', 'Affected by your pick: ');
        notice.setAttribute('data-k-notice', '');
        flags[code].forEach(function (pick, i) {
          if (i > 0) notice.appendChild(document.createTextNode(', '));
          var link = el('a', '', pick);
          link.href = '#' + pick.split(' ')[0];
          notice.appendChild(link);
        });
        var section = byCode[code];
        var head = section.querySelector('h2, h3');
        section.insertBefore(notice, head && head.parentNode === section ? head.nextSibling : section.firstChild);
      });
      if (preview) preview.textContent = text() || 'Nothing picked yet.';
      if (status) status.textContent = '';
    }

    if (bar && button) {
      bar.hidden = false;
      button.addEventListener('click', function () {
        var t = text();
        if (t === '') {
          status.textContent = 'Pick an option first. Nothing was copied.';
          return;
        }
        var n = t.split('\n').length;
        copy(t, function (ok) {
          status.textContent = ok
            ? 'Copied ' + n + (n === 1 ? ' answer' : ' answers') + '. Paste into the prompt.'
            : 'The browser blocked the copy. Select the lines above and copy them.';
        });
      });
    }

    var start = decodeURIComponent((window.location.hash || '').slice(1));
    select(byCode[start] ? start : order[0], false);
    update();
  }

  document.addEventListener('DOMContentLoaded', function () {
    themeToggle();
    questionPage();
  });
})(typeof window !== 'undefined' ? window : globalThis);
