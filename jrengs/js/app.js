/* JRENGS — storefront behaviour */
(function () {
  'use strict';

  var J = window.JRENGS;
  var fmt = J.fmt, esc = J.esc, store = J.store, CONTACT = J.CONTACT;

  var CART_KEY = 'jrengs_cart_v1';
  var MAX_QTY = 50;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- catalog (read from the page itself) ---------- */
  var catalog = {};
  $$('.product[data-id]').forEach(function (el) {
    catalog[el.dataset.id] = {
      id: el.dataset.id,
      name: el.dataset.name,
      price: Number(el.dataset.price),
      spicy: el.dataset.spicy === '1'
    };
  });

  function clampQty(n) {
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) return 1;
    return Math.min(MAX_QTY, n);
  }
  function clampLevel(n) {
    n = parseInt(n, 10);
    return n >= 1 && n <= 3 ? n : 1;
  }
  function lineKey(id, level) { return id + (level ? ':' + level : ''); }

  /* ---------- cart state ---------- */
  var cart = loadCart();

  function loadCart() {
    try {
      var raw = JSON.parse(sessionStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (l) { return l && catalog[l.id]; }).map(function (l) {
        var level = catalog[l.id].spicy ? clampLevel(l.level) : null;
        return { key: lineKey(l.id, level), id: l.id, level: level, qty: clampQty(l.qty) };
      });
    } catch (e) { return []; }
  }
  function persist() {
    try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* ignore */ }
  }
  function cartTotal() {
    return cart.reduce(function (s, l) { return s + catalog[l.id].price * l.qty; }, 0);
  }
  function cartCount() {
    return cart.reduce(function (s, l) { return s + l.qty; }, 0);
  }

  function addItem(id, qty, level) {
    var p = catalog[id];
    if (!p) return;
    level = p.spicy ? clampLevel(level) : null;
    var key = lineKey(id, level);
    var line = cart.filter(function (l) { return l.key === key; })[0];
    if (line) line.qty = clampQty(line.qty + qty);
    else cart.push({ key: key, id: id, level: level, qty: clampQty(qty) });
    persist(); renderCart();
  }
  function changeQty(key, delta) {
    var line = cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    line.qty = clampQty(line.qty + delta);
    persist(); renderCart();
  }
  function removeLine(key) {
    cart = cart.filter(function (l) { return l.key !== key; });
    persist(); renderCart();
  }
  function setLevel(key, level) {
    var line = cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    level = clampLevel(level);
    var newKey = lineKey(line.id, level);
    var other = cart.filter(function (l) { return l.key === newKey && l !== line; })[0];
    if (other) {                       // merge with the identical line
      other.qty = clampQty(other.qty + line.qty);
      cart = cart.filter(function (l) { return l !== line; });
    } else {
      line.level = level; line.key = newKey;
    }
    persist(); renderCart();
  }

  /* ---------- cart rendering ---------- */
  var cartBox = $('#cart');
  var totalRow = $('#cart-total-row');
  var totalEl = $('#cart-total');
  var fab = $('#cart-fab');
  var orderVisible = false;

  var CHILI = ['', '🌶', '🌶🌶', '🌶🌶🌶'];

  function renderCart() {
    if (!cart.length) {
      cartBox.innerHTML =
        '<div class="cart-empty"><div class="big" aria-hidden="true">🛒</div>' +
        '<p>Belum ada pesanan.<br>Pilih menu, lalu tekan “Tambah ke pesanan”.</p>' +
        '<p style="margin-top:14px"><a class="btn btn--sm btn--green" href="#menu">Lihat menu</a></p></div>';
      totalRow.hidden = true;
    } else {
      cartBox.innerHTML = '<ul class="cart-list">' + cart.map(function (l, i) {
        var p = catalog[l.id];
        var levelSel = '';
        if (p.spicy) {
          levelSel = '<label class="sr-only" for="lv-' + i + '">Level pedas ' + esc(p.name) + '</label>' +
            '<select id="lv-' + i + '" data-level>' +
            [1, 2, 3].map(function (n) {
              return '<option value="' + n + '"' + (n === l.level ? ' selected' : '') + '>Level ' + n + ' ' + CHILI[n] + '</option>';
            }).join('') + '</select>';
        }
        return '<li class="cart-line" data-key="' + esc(l.key) + '">' +
          '<div class="name">' + esc(p.name) + '<small>' + fmt(p.price) + ' × ' + l.qty +
          (p.spicy ? ' · Level ' + l.level : '') + '</small></div>' +
          '<div class="sub">' + fmt(p.price * l.qty) + '</div>' +
          '<div class="ctrl">' + levelSel +
          '<div class="qty"><button type="button" data-dec aria-label="Kurangi">−</button>' +
          '<output aria-label="Jumlah">' + l.qty + '</output>' +
          '<button type="button" data-inc aria-label="Tambah">+</button></div>' +
          '<button type="button" class="remove" data-remove aria-label="Hapus ' + esc(p.name) + '">✕</button>' +
          '</div></li>';
      }).join('') + '</ul>';
      totalRow.hidden = false;
    }
    totalEl.textContent = fmt(cartTotal());
    updateFab();
  }

  cartBox.addEventListener('click', function (e) {
    var li = e.target.closest('.cart-line');
    if (!li) return;
    var key = li.dataset.key;
    if (e.target.closest('[data-inc]')) changeQty(key, 1);
    else if (e.target.closest('[data-dec]')) changeQty(key, -1);
    else if (e.target.closest('[data-remove]')) removeLine(key);
  });
  cartBox.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-level]');
    if (!sel) return;
    setLevel(sel.closest('.cart-line').dataset.key, sel.value);
  });

  function updateFab() {
    var n = cartCount();
    $('#fab-count').textContent = n + ' item';
    $('#fab-total').textContent = fmt(cartTotal());
    fab.classList.toggle('show', n > 0 && !orderVisible);
  }

  /* ---------- product cards ---------- */
  var toastEl = $('#toast');
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1900);
  }

  $$('.product[data-id]').forEach(function (card) {
    var id = card.dataset.id;
    var input = $('.qty input', card);

    $('[data-dec]', card).addEventListener('click', function () { input.value = Math.max(1, clampQty(input.value) - 1); });
    $('[data-inc]', card).addEventListener('click', function () { input.value = clampQty(clampQty(input.value) + 1); });
    input.addEventListener('change', function () { input.value = clampQty(input.value); });

    $('[data-add]', card).addEventListener('click', function () {
      var qty = clampQty(input.value);
      var checked = $('input[name="level-' + id + '"]:checked', card);
      var level = checked ? checked.value : null;
      addItem(id, qty, level);
      input.value = 1;
      var p = catalog[id];
      toast(qty + '× ' + p.name + (p.spicy ? ' (Level ' + clampLevel(level) + ')' : '') + ' ditambahkan');
    });
  });

  /* ---------- order form ---------- */
  var form = $('#order-form');
  var msgEl = $('#form-msg');
  var dlg = $('#done-dialog');

  function normPhone(v) { return String(v || '').replace(/[\s\-().]/g, ''); }
  function validPhone(v) { return /^(\+62|62|0)8\d{8,12}$/.test(normPhone(v)); }

  function setInvalid(name, bad) {
    var f = $('[data-field="' + name + '"]');
    if (f) f.classList.toggle('invalid', bad);
  }

  function waText(o) {
    var lines = ['Halo Kak ' + CONTACT.name + ', saya mau pesan JRENGS!', '', 'No. pesanan: ' + o.id, 'Nama: ' + o.name, ''];
    o.items.forEach(function (it, i) {
      lines.push((i + 1) + '. ' + it.name + (it.level ? ' (Level ' + it.level + ')' : '') + ' x' + it.qty + ' — ' + fmt(it.price * it.qty));
    });
    lines.push('', 'Total: ' + fmt(o.total));
    if (o.note) lines.push('Catatan: ' + o.note);
    return lines.join('\n');
  }
  function waLink(o) {
    return 'https://wa.me/' + CONTACT.wa + '?text=' + encodeURIComponent(waText(o));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msgEl.textContent = '';

    if (!cart.length) {
      msgEl.textContent = 'Pesanan masih kosong. Pilih menu dulu ya.';
      $('#menu').scrollIntoView({ behavior: 'smooth' });
      return;
    }

    var name = form.elements['name'].value.trim();
    var phone = normPhone(form.elements['phone'].value);
    var note = form.elements['note'].value.trim();

    var badName = name.length < 2;
    var badPhone = !validPhone(phone);
    setInvalid('name', badName);
    setInvalid('phone', badPhone);
    if (badName) { form.elements['name'].focus(); return; }
    if (badPhone) { form.elements['phone'].focus(); return; }

    var items = cart.map(function (l) {
      var p = catalog[l.id];
      return { id: l.id, name: p.name, price: p.price, qty: l.qty, level: l.level };
    });
    var order = {
      id: store.nextId(),
      createdAt: new Date().toISOString(),
      name: name,
      phone: phone,
      note: note,
      items: items,
      total: cartTotal(),
      status: 'baru'
    };

    if (!store.add(order)) {
      msgEl.innerHTML = 'Pesanan belum bisa disimpan di perangkat ini. Kirim langsung lewat ' +
        '<a href="' + waLink(order) + '" target="_blank" rel="noopener">WhatsApp ke Maria</a>.';
      return;
    }

    cart = [];
    persist(); renderCart();
    form.reset();
    setInvalid('name', false); setInvalid('phone', false);
    showDone(order);
  });

  ['name', 'phone'].forEach(function (n) {
    form.elements[n].addEventListener('input', function () { setInvalid(n, false); });
  });

  function showDone(order) {
    $('#done-id').textContent = order.id;
    $('#done-name').textContent = order.name;
    $('#done-wa').href = waLink(order);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  $('#done-close').addEventListener('click', function () {
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  /* ---------- mobile nav ---------- */
  var nav = $('#nav');
  var burger = $('#burger');
  function setNav(open) {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
  }
  burger.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.site-header')) setNav(false);
  });
  window.addEventListener('resize', function () { if (window.innerWidth > 820) setNav(false); });

  /* ---------- breadcrumbs + active link on scroll ---------- */
  var sections = $$('section[data-crumb]');
  var crumbs = $('#crumbs');
  var activeSec = null;

  function setCrumb(sec) {
    var id = sec.id;
    crumbs.innerHTML = id === 'home'
      ? '<li><span aria-current="page">Beranda</span></li>'
      : '<li><a href="#home">Beranda</a></li><li><span aria-current="page">' + esc(sec.dataset.crumb) + '</span></li>';
    $$('.nav a').forEach(function (a) { a.classList.toggle('active', a.dataset.link === id); });
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var line = window.innerHeight * 0.32;
      var cur = sections[0];
      sections.forEach(function (s) { if (s.getBoundingClientRect().top <= line) cur = s; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) cur = sections[sections.length - 1];
      if (cur !== activeSec) { activeSec = cur; setCrumb(cur); }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- reveal + order-section visibility ---------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: .12 });
    $$('.reveal').forEach(function (el) { io.observe(el); });

    new IntersectionObserver(function (entries) {
      orderVisible = entries[0].isIntersecting;
      updateFab();
    }, { threshold: .15 }).observe($('#order'));
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- init ---------- */
  $('#year').textContent = new Date().getFullYear();
  renderCart();
})();
