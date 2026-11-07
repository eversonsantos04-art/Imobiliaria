/* VivaLar — Painel administrativo (CRUD com persistência local) */
(function () {
  'use strict';

  /* DEMO: login e dados ficam no navegador. Em produção, use um backend
     com autenticação real (nunca confie em senha fixa no front-end). */
  const USER_DEMO = 'admin';
  const PASS_DEMO = 'viva123';
  const CHAVE = 'vivalar_imoveis';
  const SESSAO = 'vivalar_admin';
  const G_MAX = 5;
  const TIPOS = ['Apartamento', 'Casa', 'Cobertura', 'Loft', 'Sala Comercial', 'Terreno'];

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  /* ---------- Storage ---------- */
  function seed() {
    return (window.VivaLarSeed || []).map((im) => ({ ...im, feats: [...(im.feats || [])] }));
  }
  function getAll() {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (_) { /* indisponível */ }
    return seed();
  }
  function saveAll(arr) {
    localStorage.setItem(CHAVE, JSON.stringify(arr));
  }
  function logado() {
    try { return sessionStorage.getItem(SESSAO) === '1'; } catch (_) { return false; }
  }

  /* ---------- Toast ---------- */
  const toastEl = $('#toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  /* ---------- Login ---------- */
  const loginView = $('#loginView');
  const dashView = $('#dashView');
  const btnSair = $('#btnSair');

  function showLogin() {
    loginView.hidden = false;
    dashView.hidden = true;
    btnSair.hidden = true;
  }
  function showDash() {
    loginView.hidden = true;
    dashView.hidden = false;
    btnSair.hidden = false;
    renderTable();
  }
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim();
    const p = $('#loginPass').value;
    if (u === USER_DEMO && p === PASS_DEMO) {
      try { sessionStorage.setItem(SESSAO, '1'); } catch (_) {}
      $('#loginError').hidden = true;
      e.target.reset();
      showDash();
      toast('Bem-vindo ao painel!');
    } else {
      const err = $('#loginError');
      err.textContent = 'Usuário ou senha incorretos.';
      err.hidden = false;
    }
  });
  btnSair.addEventListener('click', () => {
    try { sessionStorage.removeItem(SESSAO); } catch (_) {}
    showLogin();
  });

  /* ---------- Tabela ---------- */
  const tbody = $('#tbody');

  function displaySrc(src) {
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    if (/\.(jpe?g|png|gif|webp)$/i.test(src)) return src;
    return src + '.jpg';
  }
  function capaDe(im) {
    if (Array.isArray(im.fotos)) {
      const f = im.fotos.find(Boolean);
      if (f) return displaySrc(f);
    }
    if (typeof im.id === 'number') return `assets/img/imovel-${im.id}-1.jpg`;
    return '';
  }
  function precoTxt(im) {
    return im.operacao === 'aluguel' ? `${BRL.format(im.preco || 0)}/mês` : BRL.format(im.preco || 0);
  }

  function renderTable() {
    const all = getAll();
    const q = $('#q').value.trim().toLowerCase();
    const op = $('#fOp').value;
    const list = all.filter((im) =>
      (!op || im.operacao === op) &&
      (!q || [im.titulo, im.cidade, im.bairro, im.tipo].filter(Boolean).join(' ').toLowerCase().includes(q))
    );
    $('#stTotal').textContent = all.length;
    $('#stVenda').textContent = all.filter((i) => i.operacao === 'venda').length;
    $('#stAluguel').textContent = all.filter((i) => i.operacao === 'aluguel').length;
    $('#stValor').textContent = BRL.format(all.reduce((s, i) => s + (+i.preco || 0), 0));
    $('#count').textContent = `${list.length} de ${all.length} ${all.length === 1 ? 'imóvel' : 'imóveis'}`;
    tbody.innerHTML = list.length ? list.map((im) => {
      const capa = capaDe(im);
      const cor = im.cor || ['#0e7c66', '#14b8a6'];
      return `<tr>
        <td class="cell-nolabel"><div class="cell-main">
          <span class="thumb" style="background:linear-gradient(135deg, ${cor[0]}, ${cor[1]})">${capa ? `<img src="${capa}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>
          <div><strong>${esc(im.titulo)}</strong><span>${esc(im.bairro || '')} · ${esc(im.cidade || '')}/${esc(im.uf || '')}</span></div>
        </div></td>
        <td data-label="Tipo">${esc(im.tipo || '—')}</td>
        <td data-label="Operação"><span class="badge badge--${im.operacao}">${im.operacao === 'venda' ? 'Venda' : 'Aluguel'}</span></td>
        <td data-label="Preço" class="price">${precoTxt(im)}</td>
        <td data-label="Ações" class="cell-actions cell-nolabel">
          <button class="btn btn--outline btn--sm" data-act="edit" data-id="${im.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-act="del" data-id="${im.id}" type="button">Excluir</button>
        </td>
      </tr>`;
    }).join('') : `<tr class="empty-row"><td colspan="5">Nenhum imóvel encontrado. Clique em “Novo imóvel” para começar.</td></tr>`;
  }
  $('#q').addEventListener('input', renderTable);
  $('#fOp').addEventListener('change', renderTable);
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.act === 'edit') openForm(id);
    else askDelete(id);
  });

  /* ---------- Modal genérico ---------- */
  function openModal(m) { m.hidden = false; }
  function closeModal(m) { m.hidden = true; }
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $$('.modal').forEach(closeModal);
  });

  /* ---------- Confirmação ---------- */
  let pending = null;
  function ask(text, fn) {
    $('#confirmText').textContent = text;
    pending = fn;
    openModal($('#confirmModal'));
  }
  $('#confirmYes').addEventListener('click', () => {
    closeModal($('#confirmModal'));
    if (pending) { pending(); pending = null; }
  });
  function askDelete(id) {
    const im = getAll().find((i) => String(i.id) === String(id));
    ask(`Excluir “${im ? im.titulo : ''}” do catálogo? Essa ação não pode ser desfeita.`, () => {
      saveAll(getAll().filter((i) => String(i.id) !== String(id)));
      renderTable();
      toast('Imóvel excluído.');
    });
  }
  $('#btnReset').addEventListener('click', () => {
    ask('Descartar todas as alterações e voltar ao catálogo original?', () => {
      try { localStorage.removeItem(CHAVE); } catch (_) {}
      renderTable();
      toast('Catálogo original restaurado.');
    });
  });

  /* ---------- Formulário (novo / editar) ---------- */
  let editId = null;
  let slots = [];

  function slotBase(im, n) {
    if (Array.isArray(im.fotos) && im.fotos[n - 1]) return im.fotos[n - 1];
    if (!Array.isArray(im.fotos) && typeof im.id === 'number') return `assets/img/imovel-${im.id}-${n}`;
    return null;
  }
  function renderSlots() {
    const box = $('#slots');
    box.innerHTML = '';
    slots.forEach((src, i) => {
      const prev = src ? displaySrc(src) : '';
      const div = document.createElement('div');
      div.className = 'slot';
      div.innerHTML = `
        ${i === 0 ? '<span class="slot__tag">Capa</span>' : ''}
        <div class="slot__prev">${prev ? `<img src="${prev}" alt="Foto ${i + 1}" onerror="this.remove()">` : `<span>Foto ${i + 1}</span>`}</div>
        <label class="slot__pick">Escolher<input type="file" accept="image/*" data-slot="${i}" hidden></label>
        ${src ? `<button class="slot__rm" type="button" data-rm="${i}" aria-label="Remover foto ${i + 1}">✕</button>` : ''}`;
      box.appendChild(div);
    });
  }
  $('#slots').addEventListener('change', async (e) => {
    const input = e.target.closest('input[type="file"]');
    if (!input || !input.files[0]) return;
    try {
      slots[+input.dataset.slot] = await fileToDataURL(input.files[0]);
      renderSlots();
    } catch (_) {
      toast('Não foi possível ler essa imagem.');
    }
    input.value = '';
  });
  $('#slots').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { slots[+rm.dataset.rm] = null; renderSlots(); }
  });

  function fileToDataURL(file, maxW = 1000, q = 0.82) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxW / img.width);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale));
          c.height = Math.max(1, Math.round(img.height * scale));
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          res(c.toDataURL('image/jpeg', q));
        } catch (err) { rej(err); }
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  function openForm(id) {
    const all = getAll();
    const im = id == null ? null : all.find((i) => String(i.id) === String(id));
    editId = im ? im.id : null;
    $('#formTitle').textContent = im ? 'Editar imóvel' : 'Novo imóvel';
    $('#f_titulo').value = im?.titulo || '';
    $('#f_tipo').value = im?.tipo && TIPOS.includes(im.tipo) ? im.tipo : TIPOS[0];
    $('#f_operacao').value = im?.operacao === 'aluguel' ? 'aluguel' : 'venda';
    $('#f_preco').value = im?.preco ?? '';
    $('#f_area').value = im?.area ?? '';
    $('#f_cidade').value = im?.cidade || '';
    $('#f_bairro').value = im?.bairro || '';
    $('#f_uf').value = im?.uf || '';
    $('#f_quartos').value = im?.quartos ?? 2;
    $('#f_vagas').value = im?.vagas ?? 1;
    $('#f_destaque').checked = !!im?.destaque;
    $('#f_novo').checked = !!im?.novo;
    $('#f_desc').value = im?.desc || '';
    $('#f_feats').value = (im?.feats || []).join('\n');
    slots = Array.from({ length: G_MAX }, (_, n) => (im ? slotBase(im, n + 1) : null));
    renderSlots();
    $('#formError').hidden = true;
    openModal($('#formModal'));
    setTimeout(() => $('#f_titulo').focus(), 50);
  }
  $('#btnNovo').addEventListener('click', () => openForm(null));

  const CORES = {
    Apartamento: ['#0e7c66', '#14b8a6'], Casa: ['#b45309', '#e8a33d'],
    Cobertura: ['#1d4ed8', '#38bdf8'], Loft: ['#be123c', '#fb7185'],
    'Sala Comercial': ['#475569', '#94a3b8'], Terreno: ['#65a30d', '#a3e635'],
  };
  $('#imovelForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('#formError');
    const titulo = $('#f_titulo').value.trim();
    const cidade = $('#f_cidade').value.trim();
    const bairro = $('#f_bairro').value.trim();
    const uf = $('#f_uf').value.trim().toUpperCase();
    const preco = +$('#f_preco').value;
    const area = +$('#f_area').value;
    let msg = '';
    if (titulo.length < 3) msg = 'Informe um título com ao menos 3 caracteres.';
    else if (!cidade) msg = 'Informe a cidade.';
    else if (!bairro) msg = 'Informe o bairro.';
    else if (!/^[A-Z]{2}$/.test(uf)) msg = 'UF deve ter 2 letras (ex.: SP).';
    else if (!(preco > 0)) msg = 'Informe um preço válido maior que zero.';
    else if (!(area > 0)) msg = 'Informe uma área válida maior que zero.';
    if (msg) { err.textContent = msg; err.hidden = false; return; }
    err.hidden = true;

    const tipo = $('#f_tipo').value;
    const fotos = [...slots];
    while (fotos.length && !fotos[fotos.length - 1]) fotos.pop();
    const obj = {
      id: editId ?? `n${Date.now()}`,
      titulo, tipo,
      operacao: $('#f_operacao').value,
      cidade, bairro, uf, preco, area,
      quartos: Math.max(0, +$('#f_quartos').value || 0),
      vagas: Math.max(0, +$('#f_vagas').value || 0),
      destaque: $('#f_destaque').checked,
      novo: $('#f_novo').checked,
      cor: CORES[tipo] || ['#0e7c66', '#14b8a6'],
      desc: $('#f_desc').value.trim(),
      feats: $('#f_feats').value.split('\n').map((s) => s.trim()).filter(Boolean),
      fotos,
    };
    const all = getAll();
    if (editId == null) all.unshift(obj);
    else {
      const i = all.findIndex((x) => String(x.id) === String(editId));
      if (i >= 0) all[i] = { ...all[i], ...obj, id: all[i].id };
    }
    try {
      saveAll(all);
    } catch (_) {
      err.textContent = 'Não foi possível salvar: armazenamento cheio. Remova fotos ou use imagens menores.';
      err.hidden = false;
      return;
    }
    closeModal($('#formModal'));
    renderTable();
    toast(editId == null ? 'Imóvel cadastrado!' : 'Alterações salvas!');
  });

  /* ---------- Init ---------- */
  if (logado()) showDash();
  else showLogin();
})();
