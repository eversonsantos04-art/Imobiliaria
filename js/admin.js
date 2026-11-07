/* Corretores de Imóveis — Painel administrativo (CRUD com persistência local) */
(function () {
  'use strict';

  /* SEGURANÇA — nenhuma senha fica no código nem no site.
     Na primeira abertura o painel pede para criar uma senha: só o hash
     (com sal, derivado por SHA-256) fica gravado no navegador.
     A sessão expira sozinha e a tela bloqueia após inatividade.
     Esqueceu a senha? No console do navegador:
       localStorage.removeItem('vivalar_admin_cred');
     (reabre a criação de senha e NÃO apaga os imóveis).
     Isso protege o painel neste navegador. Na versão publicada, some a
     proteção do servidor (Basic Auth / Cloudflare Access) e, quando
     precisar de vários aparelhos, migre para backend com auth real. */
  const CRED = 'vivalar_admin_cred';
  const TENT = 'vivalar_admin_tent';
  const CHAVE = 'vivalar_imoveis';
  const SESSAO = 'vivalar_admin';
  const TTL_SESSAO = 30 * 60 * 1000;   /* sessão de 30 min, renovada ao usar */
  const AUTO_LOCK = 15 * 60 * 1000;    /* bloqueia após 15 min sem mexer */
  const MAX_TENT = 5;                  /* senhas erradas antes do bloqueio */
  const BLOQUEIO = 30 * 1000;          /* 30 s de bloqueio */
  const ITER = 60000;                  /* custo da derivação da senha */
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
    let salvo = null;
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) salvo = arr;
      }
    } catch (_) { /* indisponível */ }
    const codigos = window.VivaLarCodigos;
    if (!codigos) return Array.isArray(salvo) ? salvo : seed();
    const lista = codigos.normalizar(Array.isArray(salvo) ? salvo : seed());
    /* Guarda os códigos gerados para não mudarem entre sessões */
    if (Array.isArray(salvo) && lista.some((im, i) => im !== salvo[i])) {
      try { saveAll(lista); } catch (_) { /* storage cheio */ }
    }
    return lista;
  }
  function saveAll(arr) {
    localStorage.setItem(CHAVE, JSON.stringify(arr));
  }
  function logado() {
    try {
      const exp = Number(sessionStorage.getItem(SESSAO) || 0);
      return exp > Date.now();
    } catch (_) { return false; }
  }
  function abrirSessao() {
    try { sessionStorage.setItem(SESSAO, String(Date.now() + TTL_SESSAO)); } catch (_) {}
  }
  function encerrarSessao() {
    try { sessionStorage.removeItem(SESSAO); } catch (_) {}
  }

  /* ---------- Toast ---------- */
  const toastEl = $('#toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  /* ---------- SHA-256 puro (funciona em file://, http e https) ----------
     Testado contra os vetores oficiais do NIST e contra o OpenSSL. */
  const SHA_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  function sha256Hex(txt) {
    const msg = new TextEncoder().encode(txt);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = msg.length;
    const total = (((len + 8) >> 6) + 1) << 6;
    const data = new Uint8Array(total);
    data.set(msg);
    data[len] = 0x80;
    const bits = len * 8;
    const hi = Math.floor(bits / 0x100000000);
    const lo = bits >>> 0;
    data[total - 8] = (hi >>> 24) & 0xff;
    data[total - 7] = (hi >>> 16) & 0xff;
    data[total - 6] = (hi >>> 8) & 0xff;
    data[total - 5] = hi & 0xff;
    data[total - 4] = (lo >>> 24) & 0xff;
    data[total - 3] = (lo >>> 16) & 0xff;
    data[total - 2] = (lo >>> 8) & 0xff;
    data[total - 1] = lo & 0xff;
    const w = new Int32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        w[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3];
      }
      for (let i = 16; i < 64; i++) {
        const a15 = w[i - 15];
        const a2 = w[i - 2];
        const s0 = ((a15 >>> 7) | (a15 << 25)) ^ ((a15 >>> 18) | (a15 << 14)) ^ (a15 >>> 3);
        const s1 = ((a2 >>> 17) | (a2 << 15)) ^ ((a2 >>> 19) | (a2 << 13)) ^ (a2 >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    let out = '';
    for (let i = 0; i < 8; i++) out += (H[i] >>> 0).toString(16).padStart(8, '0');
    return out;
  }

  /* ---------- Credencial: só o hash com sal fica gravado ---------- */
  function derivarSenha(senha, salt, iter) {
    let h = sha256Hex(salt + ':' + senha);
    for (let i = 0; i < iter; i++) h = sha256Hex(salt + ':' + h + ':' + i);
    return h;
  }
  function mesmaHash(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }
  function lerCred() {
    try {
      const c = JSON.parse(localStorage.getItem(CRED) || 'null');
      if (c && typeof c.salt === 'string' && typeof c.hash === 'string') return c;
    } catch (_) { /* storage indisponível */ }
    return null;
  }
  function criarCred(senha) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let salt = '';
    for (const b of bytes) salt += b.toString(16).padStart(2, '0');
    try {
      localStorage.setItem(CRED, JSON.stringify({
        salt,
        hash: derivarSenha(senha, salt, ITER),
        iter: ITER,
        criadoEm: new Date().toISOString(),
      }));
      return true;
    } catch (_) { return false; }
  }

  /* ---------- Tentativas erradas ---------- */
  function lerTent() {
    try {
      const t = JSON.parse(localStorage.getItem(TENT) || 'null');
      if (t && typeof t.n === 'number') return t;
    } catch (_) { /* storage indisponível */ }
    return { n: 0, ate: 0 };
  }
  function bloqueadoAte() { return lerTent().ate || 0; }
  function registrarTentativa() {
    const agora = Date.now();
    const t = lerTent();
    /* zera a contagem só quando um bloqueio anterior já expirou */
    const expirouBloqueio = t.ate > 0 && t.ate <= agora;
    t.n = (expirouBloqueio ? 0 : t.n) + 1;
    if (t.n >= MAX_TENT) { t.n = 0; t.ate = agora + BLOQUEIO; } else { t.ate = 0; }
    try { localStorage.setItem(TENT, JSON.stringify(t)); } catch (_) {}
    return { n: t.n, bloqueado: t.ate > agora };
  }
  function limparTentativas() {
    try { localStorage.removeItem(TENT); } catch (_) {}
  }

  /* ---------- Auto-lock (bloqueio por inatividade) ---------- */
  let relogioLock = null;
  let ultimoUso = 0;
  function pararLock() { clearTimeout(relogioLock); relogioLock = null; }
  function renovarLock() {
    pararLock();
    if (!logado()) return;
    relogioLock = setTimeout(() => {
      encerrarSessao();
      showLogin();
      toast('Tela bloqueada por inatividade.');
    }, AUTO_LOCK);
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, () => {
      if (!logado()) return;
      const agora = Date.now();
      if (agora - ultimoUso > 60000) { ultimoUso = agora; abrirSessao(); }
      renovarLock();
    }, { passive: true });
  });

  /* ---------- Login ---------- */
  const loginView = $('#loginView');
  const dashView = $('#dashView');
  const btnSair = $('#btnSair');

  /* Ajusta o cartão entre "criar senha" (1ª abertura) e "entrar" */
  function pintarLogin() {
    const setup = !lerCred();
    $('#loginTitle').textContent = setup ? 'Crie sua senha de acesso' : 'Acesso restrito';
    $('#loginSub').textContent = setup
      ? 'Primeira abertura deste navegador. Escolha uma senha forte — ela não está gravada em nenhum lugar além daqui.'
      : 'Entre com a senha deste navegador para gerenciar o catálogo.';
    $('#fieldPass2').hidden = !setup;
    $('#loginPass2').required = setup;
    $('#loginBtn').textContent = setup ? 'Criar senha e entrar' : 'Entrar no painel';
    $('#loginHint').textContent = setup
      ? 'Mínimo de 8 caracteres. Anote a senha: ela protege este painel neste navegador.'
      : 'A sessão expira sozinha e a tela bloqueia após 15 minutos sem uso.';
    $('#loginPass').autocomplete = setup ? 'new-password' : 'current-password';
  }

  function showLogin() {
    pintarLogin();
    loginView.hidden = false;
    dashView.hidden = true;
    btnSair.hidden = true;
    pararLock();
  }
  function showDash() {
    loginView.hidden = true;
    dashView.hidden = false;
    btnSair.hidden = false;
    renderTable();
    ultimoUso = Date.now();
    renovarLock();
  }
  function erro(msg) {
    const el = $('#loginError');
    el.textContent = msg;
    el.hidden = false;
  }
  function entrar() {
    abrirSessao();
    $('#loginError').hidden = true;
    $('#loginForm').reset();
    showDash();
    toast('Bem-vindo ao painel!');
  }

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const senha = $('#loginPass').value;

    const ate = bloqueadoAte();
    if (ate > Date.now()) {
      erro(`Muitas tentativas erradas. Aguarde ${Math.ceil((ate - Date.now()) / 1000)} s.`);
      return;
    }

    if (!lerCred()) {                       /* 1ª abertura: criar a senha */
      if (senha.length < 8) { erro('Crie uma senha com pelo menos 8 caracteres.'); return; }
      if (senha !== $('#loginPass2').value) { erro('As senhas não conferem.'); return; }
      if (!criarCred(senha) || !lerCred()) {
        erro('Não foi possível salvar a senha neste navegador (armazenamento bloqueado ou cheio).');
        return;
      }
      entrar();
      return;
    }

    const cred = lerCred();
    const calc = derivarSenha(senha, cred.salt, cred.iter || ITER);
    if (mesmaHash(calc, cred.hash)) {
      limparTentativas();
      entrar();
    } else {
      const t = registrarTentativa();
      $('#loginPass').value = '';
      $('#loginPass').focus();
      erro(t.bloqueado
        ? `Senha incorreta. Por segurança, o acesso fica bloqueado por ${BLOQUEIO / 1000} s.`
        : `Senha incorreta. Restam ${MAX_TENT - t.n} tentativa(s) antes do bloqueio.`);
    }
  });
  btnSair.addEventListener('click', () => {
    encerrarSessao();
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
      (!q || [im.codigo, im.titulo, im.cidade, im.bairro, im.tipo].filter(Boolean).join(' ').toLowerCase().includes(q))
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
        <td data-label="Código" class="cell-code">
          <button class="cod" type="button" data-act="copy" data-cod="${esc(im.codigo || '')}" title="Clicar para copiar o código">${esc(im.codigo || '—')}</button>
        </td>
        <td data-label="Tipo">${esc(im.tipo || '—')}</td>
        <td data-label="Operação"><span class="badge badge--${im.operacao}">${im.operacao === 'venda' ? 'Venda' : 'Aluguel'}</span></td>
        <td data-label="Preço" class="price">${precoTxt(im)}</td>
        <td data-label="Ações" class="cell-actions cell-nolabel">
          <button class="btn btn--outline btn--sm" data-act="edit" data-id="${esc(im.id)}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-act="del" data-id="${esc(im.id)}" type="button">Excluir</button>
        </td>
      </tr>`;
    }).join('') : `<tr class="empty-row"><td colspan="6">Nenhum imóvel encontrado. Clique em “Novo imóvel” para começar.</td></tr>`;
  }
  $('#q').addEventListener('input', renderTable);
  $('#fOp').addEventListener('change', renderTable);
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'copy') { copiarCodigo(btn.dataset.cod); return; }
    const id = btn.dataset.id;
    if (act === 'edit') openForm(id);
    else if (act === 'del') askDelete(id);
  });

  /* Copia o código do imóvel (com fallback para páginas abertas via file://) */
  function copiarCodigo(txt) {
    const codigo = String(txt || '').trim();
    if (!codigo) return;
    const ok = () => toast(`Código ${codigo} copiado!`);
    const legado = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = codigo;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        const copiou = document.execCommand('copy');
        ta.remove();
        copiou ? ok() : toast(`Não foi possível copiar. Código: ${codigo}`);
      } catch (_) {
        toast(`Não foi possível copiar. Código: ${codigo}`);
      }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(codigo).then(ok).catch(legado);
    } else {
      legado();
    }
  }

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
    $('#f_codigo').value = im
      ? (im.codigo || '')
      : (window.VivaLarCodigos ? window.VivaLarCodigos.proximo(all) : '');
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
    const codigos = window.VivaLarCodigos;
    const all = getAll();
    const codigo = codigos
      ? codigos.texto($('#f_codigo').value)
      : $('#f_codigo').value.trim().toUpperCase();
    let msg = '';
    if (titulo.length < 3) msg = 'Informe um título com ao menos 3 caracteres.';
    else if (!cidade) msg = 'Informe a cidade.';
    else if (!bairro) msg = 'Informe o bairro.';
    else if (!/^[A-Z]{2}$/.test(uf)) msg = 'UF deve ter 2 letras (ex.: SP).';
    else if (!(preco > 0)) msg = 'Informe um preço válido maior que zero.';
    else if (!(area > 0)) msg = 'Informe uma área válida maior que zero.';
    else if (codigo && codigos && !codigos.conferir(codigo)) msg = 'Código inválido. Use só letras, números e hífen (ex.: VL-001, AP-12, TEMP-3).';
    else if (codigo && all.some((x) => String(x.codigo) === codigo && String(x.id) !== String(editId))) msg = `Já existe um imóvel com o código “${codigo}”. Escolha outro.`;
    if (msg) { err.textContent = msg; err.hidden = false; return; }
    err.hidden = true;

    /* Em branco = gera o próximo código livre da sequência (ex.: VL-013) */
    const finalCodigo = codigo || (codigos ? codigos.proximo(all) : '');
    const tipo = $('#f_tipo').value;
    const fotos = [...slots];
    while (fotos.length && !fotos[fotos.length - 1]) fotos.pop();
    const obj = {
      id: editId ?? `n${Date.now()}`,
      codigo: finalCodigo,
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
    toast(editId == null ? `Imóvel cadastrado! Código ${finalCodigo}` : 'Alterações salvas!');
  });

  /* ---------- Init ---------- */
  if (logado()) showDash();
  else showLogin();
})();
