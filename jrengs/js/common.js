/* JRENGS — shared helpers: theme, formatting, order storage */
(function () {
  'use strict';

  var ORDERS_KEY = 'jrengs_orders_v1';
  var SEQ_KEY = 'jrengs_seq_v1';
  var THEME_KEY = 'jrengs_theme';

  var CONTACT = {
    name: 'Maria',
    phone: '085641495019',
    display: '0856-4149-5019',
    wa: '6285641495019'
  };

  /* ---------- tiny safe-storage wrappers ---------- */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- formatting ---------- */
  function fmt(n) {
    return 'Rp' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  /* ---------- order storage ----------
     Everything goes through this object, so the storage can later be
     swapped for a real backend (API / database) without touching the UI. */
  var store = {
    list: function () {
      var l = read(ORDERS_KEY, []);
      return Array.isArray(l) ? l : [];
    },
    nextId: function () {
      var n = Number(read(SEQ_KEY, 0)) + 1;
      write(SEQ_KEY, n);
      return 'JR-' + String(n).padStart(4, '0');
    },
    add: function (order) {
      var l = store.list();
      l.unshift(order);
      return write(ORDERS_KEY, l);
    },
    update: function (id, patch) {
      var l = store.list();
      for (var i = 0; i < l.length; i++) {
        if (l[i].id === id) { Object.assign(l[i], patch); break; }
      }
      return write(ORDERS_KEY, l);
    },
    remove: function (id) {
      return write(ORDERS_KEY, store.list().filter(function (o) { return o.id !== id; }));
    },
    clear: function () {
      return write(ORDERS_KEY, []);
    },
    key: ORDERS_KEY
  };

  /* ---------- theme ---------- */
  function savedTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      if (t === 'dark' || t === 'light') return t;
    } catch (e) { /* ignore */ }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#111a15' : '#f9f1d3');
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
      b.setAttribute('aria-label', t === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap');
      b.setAttribute('title', t === 'dark' ? 'Mode terang' : 'Mode gelap');
    });
  }
  function initTheme() {
    applyTheme(savedTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
        applyTheme(next);
      });
    });
  }

  /* follow the OS setting only while the user has not chosen manually */
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () {
      var chosen = null;
      try { chosen = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
      if (!chosen) applyTheme(mq.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
  } else {
    initTheme();
  }

  window.JRENGS = {
    CONTACT: CONTACT,
    fmt: fmt,
    esc: esc,
    fmtDate: fmtDate,
    store: store
  };
})();
