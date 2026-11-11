/* Corretores de Imóveis — Painel administrativo (CRUD no Supabase) */
(function () {
  'use strict';

  /* SEGURANÇA — o acesso usa Supabase Auth (e-mail + senha).
     Nenhuma senha fica neste arquivo: o hash é do Supabase.
     Quem pode ler/escrever cada tabela é definido pelo RLS
     (supabase/schema.sql) — esconder o HTML não protege nada.
     Criar ou remover usuários: Supabase -> Authentication -> Users
     (no nosso fluxo, só o admin cria contas).
     O auto-lock de 15 min daqui é conforto de uso, não segurança. */
  const CHAVE = 'vivalar_imoveis';
  const SESSAO = 'vivalar_admin';
  const TTL_SESSAO = 30 * 60 * 1000;   /* sessão de 30 min, renovada ao usar */
  const AUTO_LOCK = 15 * 60 * 1000;    /* bloqueia após 15 min sem mexer */
  const G_MAX = 5;
  const TIPOS = ['Apartamento', 'Casa', 'Cobertura', 'Loft', 'Sala Comercial', 'Terreno'];

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  /* ---------- Storage: Supabase (com queda para o local se a rede cair) ---------- */
  const TABELA = 'imoveis';
  const BUCKET = 'imoveis';   /* pasta das fotos — criada por supabase/storage.sql */

  function seed() {
    return (window.VivaLarSeed || []).map((im) => ({ ...im, feats: [...(im.feats || [])] }));
  }

  /* linha do banco -> objeto do formulário: "descricao" vira "desc" */
  function deLinha(r) {
    if (!r) return r;
    const { descricao, ...resto } = r;
    return { ...resto, desc: descricao || '' };
  }
  /* objeto do formulário -> linha do banco: "desc" vira "descricao" */
  function paraLinha(o) {
    const { desc, ...resto } = o;
    return { ...resto, descricao: desc || '' };
  }

  function localGuardado() {
    try {
      const raw = localStorage.getItem(CHAVE);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (_) { /* indisponível */ }
    return null;
  }

  /* Mais novo primeiro; o desempate por código mantém a semente em ordem */
  async function getAll() {
    if (sb) {
      try {
        const { data, error } = await sb
          .from(TABELA)
          .select('*')
          .order('criado_em', { ascending: false })
          .order('codigo', { ascending: true });
        if (error) throw error;
        const lista = (data || []).map(deLinha);
        if (lista.length) return lista;
        /* banco vazio (seed ainda não rodou): cai para o local */
      } catch (_) { /* rede/RLS fora do ar: usa o fallback abaixo */ }
    }
    const salvo = localGuardado();
    const base = Array.isArray(salvo) ? salvo : seed();
    const codigos = window.VivaLarCodigos;
    return codigos ? codigos.normalizar(base) : base;
  }

  /* ---------- Escritas ---------- */
  function traduzErro(error) {
    if (error && error.code === '23505') return new Error('Já existe um imóvel com esse código. Escolha outro.');
    const m = String((error && error.message) || '');
    if (/failed to fetch|networkerror/i.test(m)) return new Error('Sem conexão com o Supabase — NADA foi salvo.');
    if (/row-level security|row level security/i.test(m)) {
      return new Error('Sem permissão para gravar. Confira se o supabase/schema.sql e o supabase/storage.sql foram rodados.');
    }
    return new Error(m || 'Não foi possível salvar no Supabase.');
  }
  async function inserirImovel(obj) {
    const { error } = await sb.from(TABELA).insert([paraLinha(obj)]);
    if (error) throw traduzErro(error);
  }
  async function atualizarImovel(id, obj) {
    const { error } = await sb.from(TABELA).update(paraLinha(obj)).eq('id', id);
    if (error) throw traduzErro(error);
  }
  async function excluirImovel(id) {
    const { error } = await sb.from(TABELA).delete().eq('id', id);
    if (error) throw traduzErro(error);
    await apagarPasta(String(id));   /* as fotos vão junto (best effort) */
  }

  /* ---------- Fotos: Supabase Storage ---------- */
  function novoId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    const b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function dataURLparaBlob(dataUrl) {
    const [cabecalho, b64] = String(dataUrl).split(',');
    const tipo = (cabecalho.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: tipo });
  }

  function urlPublica(caminho) {
    return `${window.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminho}`;
  }

  /* Envia uma foto já otimizada e devolve a URL pública definitiva */
  async function subirFoto(caminho, dataUrl) {
    const blob = dataURLparaBlob(dataUrl);
    const { error } = await sb.storage.from(BUCKET).upload(caminho, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,                 /* re-salvar sobrescreve: não acumula lixo */
    });
    if (error) throw traduzErro(error);
    return urlPublica(caminho);
  }

  async function listarArquivos(pasta) {
    try {
      const { data, error } = await sb.storage.from(BUCKET).list(pasta, { limit: 200 });
      if (error || !Array.isArray(data)) return [];
      return data.filter((a) => a && a.name).map((a) => `${pasta}/${a.name}`);
    } catch (_) { return []; }
  }

  async function apagarPasta(pasta) {
    try {
      const arqs = await listarArquivos(pasta);
      if (arqs.length) await sb.storage.from(BUCKET).remove(arqs);
    } catch (_) { /* limpeza nunca bloqueia o cadastro */ }
  }

  /* Depois de salvar, apaga do Storage o que saiu do formulário */
  async function limparPasta(pasta, urlsManter) {
    try {
      const arqs = await listarArquivos(pasta);
      if (!arqs.length) return;
      const manter = new Set(
        (urlsManter || [])
          .filter((u) => String(u).includes(`/object/public/${BUCKET}/`))
          .map((u) => String(u).split(`/object/public/${BUCKET}/`)[1])
      );
      const sobra = arqs.filter((c) => !manter.has(c));
      if (sobra.length) await sb.storage.from(BUCKET).remove(sobra);
    } catch (_) { /* best effort */ }
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

  /* ---------- Auto-lock (bloqueio por inatividade) ---------- */
  let relogioLock = null;
  let ultimoUso = 0;
  function pararLock() { clearTimeout(relogioLock); relogioLock = null; }
  function renovarLock() {
    pararLock();
    if (!logado()) return;
    relogioLock = setTimeout(() => {
      encerrarSessao();
      if (sb) sb.auth.signOut({ scope: 'local' }).catch(() => { /* offline */ });
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

  /* Cliente Supabase — a URL e a chave vêm de js/supabase-config.js
     e o supabase-js vem do CDN (ver as tags no fim do admin.html) */
  const sb = (window.supabase && window.SUPABASE_URL)
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY)
    : null;

  function pintarLogin() {
    $('#loginTitle').textContent = 'Acesso restrito';
    $('#loginSub').textContent = 'Entre com o seu e-mail e senha para gerenciar o catálogo.';
    $('#loginHint').textContent = 'A sessão expira sozinha e a tela bloqueia após 15 minutos sem uso.';
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

  /* Traduz os erros do Supabase para português */
  function msgErroLogin(err) {
    const m = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'E-mail não confirmado. Peça ao admin para confirmar no Supabase.';
    if (/rate limit|too many request/i.test(m)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
    if (/failed to fetch|networkerror/i.test(m)) return 'Sem conexão com o Supabase. Verifique a internet.';
    return m || 'Não foi possível entrar. Tente novamente.';
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#loginEmail').value.trim();
    const senha = $('#loginPass').value;

    if (!sb) { erro('Não foi possível carregar o Supabase. Recarregue a página (F5).'); return; }
    if (!email) { erro('Informe o seu e-mail.'); return; }
    if (!senha) { erro('Informe a sua senha.'); return; }

    const btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) {
        $('#loginPass').value = '';
        $('#loginPass').focus();
        erro(msgErroLogin(error));
        return;
      }
      entrar();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar no painel';
    }
  });

  btnSair.addEventListener('click', async () => {
    if (sb) { try { await sb.auth.signOut({ scope: 'local' }); } catch (_) { /* offline */ } }
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

  async function renderTable() {
    const all = await getAll();
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
  async function askDelete(id) {
    const all = await getAll();
    const im = all.find((i) => String(i.id) === String(id));
    ask(`Excluir “${im ? im.titulo : ''}” do catálogo? Sai da lista, mas continua guardado no histórico.`, async () => {
      try {
        await excluirImovel(id);
        toast('Imóvel excluído.');
      } catch (err) {
        toast(err.message || 'Não foi possível excluir.');
      }
      renderTable();
    });
  }

  /* Restaurar padrão: apaga tudo e recoloca a semente de 12 imóveis.
     O audit_log preserva todas as linhas apagadas. */
  $('#btnReset').addEventListener('click', () => {
    ask('Descartar TODOS os imóveis e voltar ao catálogo original (12 imóveis)? O histórico é mantido.', async () => {
      try {
        if (sb) {
          const { error: erroApagar } = await sb.from(TABELA)
            .delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (erroApagar) throw traduzErro(erroApagar);

          const bruta = (window.VivaLarSeed || []).map((s) => {
            const { id, ...semId } = s;
            return { ...semId, fotos: [1, 2, 3].map((n) => `assets/img/imovel-${id}-${n}.jpg`) };
          });
          const codigos = window.VivaLarCodigos;
          const semente = (codigos ? codigos.normalizar(bruta) : bruta).map(paraLinha);
          if (semente.length) {
            const { error: erroIns } = await sb.from(TABELA).insert(semente);
            if (erroIns) throw traduzErro(erroIns);
          }
        }
        try { localStorage.removeItem(CHAVE); } catch (_) {}
        toast('Catálogo original restaurado.');
      } catch (err) {
        toast(err.message || 'Não foi possível restaurar.');
      }
      renderTable();
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

  async function openForm(id) {
    const all = await getAll();
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
  $('#imovelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#formError');
    const btnSalvar = e.submitter || $('#imovelForm').querySelector('button[type="submit"]');
    const titulo = $('#f_titulo').value.trim();
    const cidade = $('#f_cidade').value.trim();
    const bairro = $('#f_bairro').value.trim();
    const uf = $('#f_uf').value.trim().toUpperCase();
    const preco = +$('#f_preco').value;
    const area = +$('#f_area').value;
    const codigos = window.VivaLarCodigos;
    const all = await getAll();
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
    const idImovel = editId ?? novoId();
    const escolhidas = slots.filter(Boolean);   /* tira as posições vazias */
    const obj = {
      id: idImovel,
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
      fotos: [],
    };

    const ehNovo = editId == null;
    if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando…'; }
    try {
      /* 1) fotos novas vão para o Storage; as já salvas ficam onde estão */
      const urls = [];
      for (let i = 0; i < escolhidas.length; i++) {
        const src = escolhidas[i];
        urls.push(src.startsWith('data:')
          ? await subirFoto(`${idImovel}/${i + 1}.jpg`, src)
          : src);
      }
      obj.fotos = urls;

      /* 2) grava o imóvel (os triggers preenchem criado_por / alterado_por) */
      if (ehNovo) await inserirImovel(obj);
      else await atualizarImovel(editId, obj);

      /* 3) remove do Storage o que saiu do formulário */
      await limparPasta(String(idImovel), urls);
    } catch (erroSalvar) {
      if (ehNovo) await apagarPasta(String(idImovel));   /* não deixa foto órfã */
      err.textContent = erroSalvar.message || 'Não foi possível salvar.';
      err.hidden = false;
      return;
    } finally {
      if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar imóvel'; }
    }

    closeModal($('#formModal'));
    renderTable();
    toast(ehNovo ? `Imóvel cadastrado! Código ${finalCodigo}` : 'Alterações salvas!');
  });

  /* ---------- Init ---------- */
  (async () => {
    if (!sb) {
      showLogin();
      erro('Não foi possível carregar o Supabase. Verifique a internet e recarregue (F5).');
      return;
    }
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { abrirSessao(); showDash(); }
      else showLogin();
    } catch (_) {
      showLogin();
    }
    /* Sai sozinho quando a sessão expirar no servidor (refresh falhou) */
    sb.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') { encerrarSessao(); showLogin(); }
    });
  })();
})();
