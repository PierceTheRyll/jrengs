/* JRENGS — shared helpers: theme, formatting, order storage.
   Penyimpanan pesanan:
   - Jika firebase-config.js sudah diisi  -> Firebase (Firestore + Authentication), pesanan terkumpul online.
   - Jika belum diisi                     -> mode lokal (hanya di browser itu sendiri, untuk uji coba). */
(function () {
  'use strict';

  var ORDERS_KEY = 'jrengs_orders_v1';
  var THEME_KEY = 'jrengs_theme';
  var SESSION_KEY = 'jrengs_admin_session';
  var LOCAL_PASS = 'cirengkeju21';      // hanya dipakai di mode lokal; mode Firebase memakai Authentication

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
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
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

  /* ---------- storage backend selection ---------- */
  var cfg = window.JRENGS_FIREBASE || {};
  var ADMIN_EMAIL = window.JRENGS_ADMIN_EMAIL || 'admin@jrengs.com';
  var cloudConfigured = !!(cfg.apiKey && cfg.projectId &&
    !/^ISI/i.test(cfg.apiKey) && !/^ISI/i.test(cfg.projectId));

  var fb = null;
  function cloud() {
    if (fb) return fb;
    if (!window.firebase) { var e = new Error('sdk'); e.code = 'jrengs/sdk'; throw e; }
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    fb = {
      db: firebase.firestore(),
      auth: typeof firebase.auth === 'function' ? firebase.auth() : null
    };
    return fb;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        var e = new Error('timeout'); e.code = 'jrengs/timeout'; reject(e);
      }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
                   function (er) { clearTimeout(t); reject(er); });
    });
  }
  function attempt(fn) {              // run fn, always return a Promise
    try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
  }

  /* order id: JR-<tanggal><bulan>-<4 karakter acak>, contoh JR-0810-K7QD */
  function newId() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    var alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var buf = new Uint32Array(4), s = '', i;
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    else for (i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 4294967296);
    for (i = 0; i < 4; i++) s += alpha[buf[i] % alpha.length];
    return 'JR-' + p(d.getDate()) + p(d.getMonth() + 1) + '-' + s;
  }

  function byNewest(a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  }

  /* ---------- local backend ---------- */
  var localSubs = [];
  var authWatchers = [];
  function localList() {
    var l = read(ORDERS_KEY, []);
    return (Array.isArray(l) ? l : []).sort(byNewest);
  }
  function localNotify() {
    var l = localList();
    localSubs.forEach(function (f) { f(l); });
  }
  window.addEventListener('storage', function (e) {
    if (e.key === ORDERS_KEY) localNotify();
  });
  function localSession() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function setLocalSession(v) {
    try { if (v) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY); }
    catch (e) { /* ignore */ }
    authWatchers.forEach(function (f) { f(v); });
  }

  /* ---------- store (semua method mengembalikan Promise) ---------- */
  var store = {
    mode: cloudConfigured ? 'cloud' : 'local',
    newId: newId,

    add: function (order) {
      if (cloudConfigured) {
        return attempt(function () {
          return withTimeout(cloud().db.collection('orders').doc(order.id).set(order), 15000);
        });
      }
      return attempt(function () {
        var l = read(ORDERS_KEY, []);
        if (!Array.isArray(l)) l = [];
        l.unshift(order);
        if (!write(ORDERS_KEY, l)) throw new Error('storage');
        localNotify();
      });
    },

    update: function (id, patch) {
      if (cloudConfigured) {
        return attempt(function () { return cloud().db.collection('orders').doc(id).update(patch); });
      }
      return attempt(function () {
        var l = read(ORDERS_KEY, []);
        l.forEach(function (o) { if (o.id === id) Object.assign(o, patch); });
        write(ORDERS_KEY, l);
        localNotify();
      });
    },

    remove: function (id) {
      if (cloudConfigured) {
        return attempt(function () { return cloud().db.collection('orders').doc(id).delete(); });
      }
      return attempt(function () {
        write(ORDERS_KEY, read(ORDERS_KEY, []).filter(function (o) { return o.id !== id; }));
        localNotify();
      });
    },

    /* langganan realtime; mengembalikan fungsi untuk berhenti */
    subscribe: function (onData, onError) {
      if (cloudConfigured) {
        try {
          return cloud().db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(
            function (snap) {
              onData(snap.docs.map(function (d) { return Object.assign({}, d.data(), { id: d.id }); }));
            },
            function (err) { if (onError) onError(err); }
          );
        } catch (e) {
          if (onError) onError(e);
          return function () {};
        }
      }
      localSubs.push(onData);
      setTimeout(function () { onData(localList()); }, 0);
      return function () { localSubs = localSubs.filter(function (f) { return f !== onData; }); };
    },

    /* login admin */
    login: function (user, pass) {
      if (cloudConfigured) {
        return attempt(function () {
          if (String(user).trim().toLowerCase() !== 'admin') {
            var e = new Error('bad user'); e.code = 'auth/invalid-credential'; throw e;
          }
          var a = cloud().auth;
          if (!a) { var e2 = new Error('sdk'); e2.code = 'jrengs/sdk'; throw e2; }
          return a.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(function () {
            return a.signInWithEmailAndPassword(ADMIN_EMAIL, pass);
          });
        });
      }
      return attempt(function () {
        if (String(user).trim().toLowerCase() === 'admin' && pass === LOCAL_PASS) {
          setLocalSession(true);
          return;
        }
        var e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e;
      });
    },

    logout: function () {
      if (cloudConfigured) {
        return attempt(function () { var a = cloud().auth; return a ? a.signOut() : null; });
      }
      return attempt(function () { setLocalSession(false); });
    },

    /* pantau status login; cb(true/false) */
    watchAuth: function (cb) {
      if (cloudConfigured) {
        try {
          var a = cloud().auth;
          if (!a) throw new Error('sdk');
          return a.onAuthStateChanged(function (u) { cb(!!u); });
        } catch (e) {
          setTimeout(function () { cb(false); }, 0);
          return function () {};
        }
      }
      authWatchers.push(cb);
      setTimeout(function () { cb(localSession()); }, 0);
      return function () { authWatchers = authWatchers.filter(function (f) { return f !== cb; }); };
    },

    /* pesan error dalam bahasa Indonesia */
    explain: function (err) {
      var c = err && err.code ? String(err.code) : '';
      if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' ||
          c === 'auth/invalid-login-credentials') return 'Username atau password salah.';
      if (c === 'auth/too-many-requests') return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
      if (c === 'auth/network-request-failed' || c === 'unavailable') return 'Tidak ada koneksi internet.';
      if (c === 'auth/operation-not-allowed') return 'Login Email/Password belum diaktifkan di Firebase.';
      if (c === 'permission-denied') return 'Akses ditolak oleh aturan database (cek Rules di Firebase).';
      if (c === 'jrengs/timeout') return 'Koneksi terlalu lambat.';
      if (c === 'jrengs/sdk') return 'Firebase gagal dimuat. Cek koneksi internet lalu muat ulang halaman.';
      return 'Terjadi kesalahan' + (c ? ' (' + c + ')' : '') + '.';
    }
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
