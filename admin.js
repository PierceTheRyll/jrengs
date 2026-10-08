/* JRENGS — admin login + orders dashboard (Firebase atau mode lokal) */
(function () {
  'use strict';

  var J = window.JRENGS;
  var fmt = J.fmt, esc = J.esc, fmtDate = J.fmtDate, store = J.store;

  var STATUS = {
    baru: 'Baru',
    diproses: 'Diproses',
    selesai: 'Selesai',
    batal: 'Dibatalkan'
  };
  var CHILI = ['', '🌶', '🌶🌶', '🌶🌶🌶'];

  var $ = function (s, r) { return (r || document).querySelector(s); };

  var loginView = $('#login-view');
  var dashView = $('#dash-view');
  var toastEl = $('#toast');
  var toastTimer;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3500);
  }

  /* ---------- mode (online / lokal) ---------- */
  var chip = $('#mode-chip');
  if (store.mode === 'cloud') {
    chip.textContent = '● Online';
    chip.title = 'Terhubung ke Firebase — pesanan dari semua perangkat masuk ke sini';
  } else {
    chip.textContent = 'Mode lokal';
    chip.classList.add('local');
    chip.title = 'Firebase belum diisi — hanya menampilkan pesanan dari browser ini';
    $('#login-note').hidden = false;
  }

  /* ---------- dashboard data ---------- */
  var cache = [];
  var seen = null;
  var unsubOrders = null;
  var newCount = 0;
  var baseTitle = 'Pesanan — Admin JRENGS!';

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.5);
      setTimeout(function () { ctx.close(); }, 800);
    } catch (e) { /* ignore */ }
  }

  function showDashError(msg) {
    var el = $('#dash-error');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function startOrders() {
    if (unsubOrders) return;
    seen = null;
    showDashError('');
    unsubOrders = store.subscribe(function (list) {
      var fresh = [];
      if (seen) list.forEach(function (o) { if (!seen[o.id]) fresh.push(o); });
      seen = {};
      list.forEach(function (o) { seen[o.id] = 1; });
      cache = list;
      showDashError('');
      render();
      if (fresh.length) {
        toast('Pesanan baru: ' + fresh[0].id + ' dari ' + fresh[0].name + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' lagi)' : ''));
        beep();
        if (document.hidden) {
          newCount += fresh.length;
          document.title = '(' + newCount + ') ' + baseTitle;
        }
      }
    }, function (err) {
      showDashError('Tidak bisa memuat pesanan: ' + store.explain(err));
    });
  }
  function stopOrders() {
    if (unsubOrders) { unsubOrders(); unsubOrders = null; }
    cache = [];
    seen = null;
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { newCount = 0; document.title = baseTitle; }
  });

  /* ---------- auth state ---------- */
  store.watchAuth(function (ok) {
    loginView.hidden = ok;
    dashView.hidden = !ok;
    document.title = ok ? baseTitle : 'Admin — JRENGS!';
    if (ok) startOrders(); else stopOrders();
  });

  /* ---------- login ---------- */
  var form = $('#login-form');
  var errEl = $('#login-err');
  var submitBtn = $('#login-submit');
  var fails = 0;
  var lockedUntil = 0;

  $('#pw-toggle').addEventListener('click', function () {
    var inp = $('#l-pass');
    var showPw = inp.type === 'password';
    inp.type = showPw ? 'text' : 'password';
    this.textContent = showPw ? 'Sembunyi' : 'Lihat';
    this.setAttribute('aria-pressed', showPw ? 'true' : 'false');
    this.setAttribute('aria-label', showPw ? 'Sembunyikan password' : 'Tampilkan password');
  });

  function isCredentialError(err) {
    var c = err && err.code ? String(err.code) : '';
    return c === 'auth/invalid-credential' || c === 'auth/wrong-password' ||
           c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var now = Date.now();
    if (now < lockedUntil) {
      errEl.textContent = 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil((lockedUntil - now) / 1000) + ' detik.';
      return;
    }
    var u = form.elements['username'].value.trim();
    var p = form.elements['password'].value;
    if (!u || !p) { errEl.textContent = 'Isi username dan password.'; return; }

    errEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memeriksa…';

    store.login(u, p).then(function () {
      fails = 0;
      form.reset();
    }).catch(function (err) {
      form.elements['password'].value = '';
      if (isCredentialError(err)) {
        fails++;
        if (fails >= 5) {
          lockedUntil = Date.now() + 30000;
          fails = 0;
          errEl.textContent = 'Terlalu banyak percobaan. Coba lagi dalam 30 detik.';
          return;
        }
      }
      errEl.textContent = store.explain(err);
      form.elements['password'].focus();
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Masuk';
    });
  });

  $('#logout').addEventListener('click', function () {
    store.logout();
  });

  /* ---------- dashboard state ---------- */
  var filter = 'semua';
  var query = '';

  function renderStats(all) {
    var by = function (s) { return all.filter(function (o) { return o.status === s; }).length; };
    var revenue = all.filter(function (o) { return o.status === 'selesai'; })
      .reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    $('#stats').innerHTML =
      '<div class="stat"><span>Total pesanan</span><strong>' + all.length + '</strong></div>' +
      '<div class="stat stat--red"><span>Baru</span><strong>' + by('baru') + '</strong></div>' +
      '<div class="stat"><span>Diproses</span><strong>' + by('diproses') + '</strong></div>' +
      '<div class="stat"><span>Pendapatan (selesai)</span><strong>' + fmt(revenue) + '</strong></div>';
  }

  function renderPrep(all) {
    var counts = {};
    all.filter(function (o) { return o.status === 'baru' || o.status === 'diproses'; }).forEach(function (o) {
      (o.items || []).forEach(function (it) {
        var label = it.name + (it.level ? ' · Lv ' + it.level : '');
        counts[label] = (counts[label] || 0) + (Number(it.qty) || 0);
      });
    });
    var keys = Object.keys(counts).sort();
    $('#prep').innerHTML = '<h2>Perlu disiapkan (Baru + Diproses)</h2>' + (keys.length
      ? '<ul>' + keys.map(function (k) { return '<li>' + counts[k] + '× ' + esc(k) + '</li>'; }).join('') + '</ul>'
      : '<p>Tidak ada pesanan aktif.</p>');
  }

  function renderChips(all) {
    var chips = [['semua', 'Semua', all.length]].concat(Object.keys(STATUS).map(function (s) {
      return [s, STATUS[s], all.filter(function (o) { return o.status === s; }).length];
    }));
    $('#chips').innerHTML = chips.map(function (c) {
      return '<button type="button" class="chip" data-filter="' + c[0] + '" aria-pressed="' + (filter === c[0]) + '">' +
        c[1] + ' <small>' + c[2] + '</small></button>';
    }).join('');
  }

  function visible(all) {
    var q = query.trim().toLowerCase();
    return all.filter(function (o) {
      if (filter !== 'semua' && o.status !== filter) return false;
      if (!q) return true;
      return [o.id, o.name, o.phone, o.note].join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }

  function waNumber(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('0') === 0) d = '62' + d.slice(1);
    return d;
  }

  function orderHTML(o) {
    var items = (o.items || []).map(function (it) {
      return '<li><span>' + (Number(it.qty) || 0) + '× ' + esc(it.name) +
        (it.level ? '<em>Level pedas ' + esc(it.level) + ' ' + (CHILI[it.level] || '') + '</em>' : '') +
        '</span><span class="amt">' + fmt((Number(it.price) || 0) * (Number(it.qty) || 0)) + '</span></li>';
    }).join('');

    var opts = Object.keys(STATUS).map(function (s) {
      return '<option value="' + s + '"' + (o.status === s ? ' selected' : '') + '>' + STATUS[s] + '</option>';
    }).join('');

    var status = STATUS[o.status] ? o.status : 'baru';
    return '<article class="order" data-id="' + esc(o.id) + '">' +
      '<div class="order-top"><div><span class="oid">' + esc(o.id) + '</span>' +
      '<span class="badge s-' + status + '">' + STATUS[status] + '</span></div>' +
      '<time datetime="' + esc(o.createdAt) + '">' + esc(fmtDate(o.createdAt)) + '</time></div>' +
      '<div class="order-body">' +
      '<div class="cust"><strong>' + esc(o.name) + '</strong><div class="links">' +
      '<a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a>' +
      '<a href="https://wa.me/' + esc(waNumber(o.phone)) + '" target="_blank" rel="noopener">WhatsApp</a></div></div>' +
      '<ul class="items">' + items + '</ul>' +
      (o.note ? '<div class="note"><b>Catatan</b>' + esc(o.note) + '</div>' : '') +
      '</div>' +
      '<div class="order-foot"><div class="total"><span>Total</span><strong>' + fmt(o.total) + '</strong></div>' +
      '<div class="row"><label class="sr-only" for="st-' + esc(o.id) + '">Status pesanan</label>' +
      '<select id="st-' + esc(o.id) + '" data-status>' + opts + '</select>' +
      '<button class="del" type="button" data-del>Hapus</button></div></div>' +
      '</article>';
  }

  function renderList() {
    var list = visible(cache);
    var box = $('#orders');
    if (!list.length) {
      box.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big" aria-hidden="true">📭</div><p>' +
        (cache.length ? 'Tidak ada pesanan yang cocok dengan filter.' : 'Belum ada pesanan masuk.') + '</p></div>';
      return;
    }
    box.innerHTML = list.map(orderHTML).join('');
  }

  function render() {
    renderStats(cache);
    renderPrep(cache);
    renderChips(cache);
    renderList();
  }

  /* ---------- interactions ---------- */
  $('#chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    render();
  });

  $('#search').addEventListener('input', function () {
    query = this.value;
    renderList();
  });

  $('#orders').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-status]');
    if (!sel) return;
    var id = sel.closest('.order').dataset.id;
    store.update(id, { status: sel.value }).catch(function (err) {
      toast('Gagal mengubah status: ' + store.explain(err));
      render();
    });
  });

  $('#orders').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (!del) return;
    var id = del.closest('.order').dataset.id;
    if (window.confirm('Hapus pesanan ' + id + '? Tindakan ini tidak bisa dibatalkan.')) {
      store.remove(id).catch(function (err) {
        toast('Gagal menghapus: ' + store.explain(err));
      });
    }
  });

  /* CSV export */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;      // neutralise spreadsheet formulas
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $('#export').addEventListener('click', function () {
    var rows = [['No. Pesanan', 'Waktu', 'Nama', 'WhatsApp', 'Pesanan', 'Total (Rp)', 'Status', 'Catatan']];
    visible(cache).forEach(function (o) {
      rows.push([
        o.id, fmtDate(o.createdAt), o.name, o.phone,
        (o.items || []).map(function (it) { return it.qty + 'x ' + it.name + (it.level ? ' (Lv ' + it.level + ')' : ''); }).join('; '),
        o.total, STATUS[o.status] || o.status, o.note || ''
      ]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'jrengs-pesanan-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
})();
