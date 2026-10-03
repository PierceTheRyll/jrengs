/* JRENGS — admin login + orders dashboard */
(function () {
  'use strict';

  var J = window.JRENGS;
  var fmt = J.fmt, esc = J.esc, fmtDate = J.fmtDate, store = J.store;

  var ADMIN_USER = 'admin';
  var ADMIN_PASS = 'cirengkeju21';
  var SESSION_KEY = 'jrengs_admin_session';

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

  /* ---------- session ---------- */
  function isLoggedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }
  function setLoggedIn(v) {
    try {
      if (v) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  }

  function show() {
    var ok = isLoggedIn();
    loginView.hidden = ok;
    dashView.hidden = !ok;
    document.title = ok ? 'Pesanan — Admin JRENGS!' : 'Admin — JRENGS!';
    if (ok) render();
  }

  /* ---------- login ---------- */
  var form = $('#login-form');
  var errEl = $('#login-err');
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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var now = Date.now();
    if (now < lockedUntil) {
      errEl.textContent = 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil((lockedUntil - now) / 1000) + ' detik.';
      return;
    }
    var u = form.elements['username'].value.trim();
    var p = form.elements['password'].value;
    if (u === ADMIN_USER && p === ADMIN_PASS) {
      fails = 0;
      errEl.textContent = '';
      form.reset();
      setLoggedIn(true);
      show();
    } else {
      fails++;
      form.elements['password'].value = '';
      if (fails >= 5) {
        lockedUntil = Date.now() + 30000;
        fails = 0;
        errEl.textContent = 'Terlalu banyak percobaan. Coba lagi dalam 30 detik.';
      } else {
        errEl.textContent = 'Username atau password salah.';
      }
      form.elements['password'].focus();
    }
  });

  $('#logout').addEventListener('click', function () {
    setLoggedIn(false);
    show();
  });

  /* ---------- dashboard state ---------- */
  var filter = 'semua';
  var query = '';

  function orders() { return store.list(); }

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

  function renderList(all) {
    var list = visible(all);
    var box = $('#orders');
    if (!list.length) {
      box.innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big" aria-hidden="true">📭</div><p>' +
        (all.length ? 'Tidak ada pesanan yang cocok dengan filter.' : 'Belum ada pesanan masuk.') + '</p></div>';
      return;
    }
    box.innerHTML = list.map(orderHTML).join('');
  }

  function render() {
    var all = orders();
    renderStats(all);
    renderPrep(all);
    renderChips(all);
    renderList(all);
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
    var all = orders();
    renderList(all);
  });

  $('#orders').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-status]');
    if (!sel) return;
    var id = sel.closest('.order').dataset.id;
    store.update(id, { status: sel.value });
    render();
  });

  $('#orders').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (!del) return;
    var id = del.closest('.order').dataset.id;
    if (window.confirm('Hapus pesanan ' + id + '? Tindakan ini tidak bisa dibatalkan.')) {
      store.remove(id);
      render();
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
    visible(orders()).forEach(function (o) {
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

  /* live updates when an order is placed in another tab of this browser */
  window.addEventListener('storage', function (e) {
    if (e.key === store.key && isLoggedIn()) render();
  });

  show();
})();
