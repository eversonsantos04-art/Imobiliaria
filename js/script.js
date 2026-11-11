/* Corretores de Imóveis — interatividade */
(function () {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  /* ---------- Dados ----------
     O catálogo vem do Supabase (a mesma tabela que o painel admin grava).
     1) Pinta na hora com a semente/local, para não deixar a página vazia;
     2) Depois troca pelos dados reais do banco;
     3) Se a rede ou o Supabase falhar, mantém o que já está na tela. */
  const CHAVE_DADOS = 'vivalar_imoveis';
  const G_MAX = 5;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function semente() {
    return Array.isArray(window.VivaLarSeed) ? window.VivaLarSeed.map((im) => ({ ...im })) : [];
  }
  function carregarImoveis() {
    let salvo = null;
    try {
      const raw = localStorage.getItem(CHAVE_DADOS);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) salvo = arr;
      }
    } catch (_) { /* storage indisponível */ }
    const base = Array.isArray(salvo) ? salvo : semente();
    /* Garante o código de referência (ex.: VL-001) em todos os imóveis */
    return (window.VivaLarCodigos ? window.VivaLarCodigos.normalizar(base) : base);
  }
  let IMOVEIS = carregarImoveis();
  /* Atualiza na hora se o painel admin salvar em outra aba (modo local) */
  window.addEventListener('storage', (e) => {
    if (e.key === CHAVE_DADOS) { IMOVEIS = carregarImoveis(); render(); }
  });

  /* No banco a coluna se chama `descricao`; no site usamos `desc` */
  function deLinha(r) {
    return { ...r, desc: (r && r.descricao) || '' };
  }

  /* Lê o catálogo no Supabase. Devolve `null` quando não foi possível
     (rede fora, chave errada…) — aí o site continua com o que já tem. */
  async function carregarRemoto() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY) return null;
    try {
      const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
      const { data, error } = await sb.from('imoveis')
        .select('*')
        .order('criado_em', { ascending: false })
        .order('codigo', { ascending: true });
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return null;
    }
  }

  /* Troca a semente pelos dados reais assim que chegarem */
  carregarRemoto().then((remoto) => {
    if (!remoto) return;                       /* falhou: mantém a tela como está */
    IMOVEIS = window.VivaLarCodigos
      ? window.VivaLarCodigos.normalizar(remoto.map(deLinha))
      : remoto.map(deLinha);
    render();
  });

  const DEPOIMENTOS = [
    { nome: 'Mariana Costa', info: 'Comprou apartamento em SP', cor: '#0e7c66', foto: 'avatar-1.jpg', texto: 'Do primeiro contato à entrega das chaves, tudo foi transparente. A corretora negociou um desconto que eu nem imaginava ser possível.' },
    { nome: 'Rafael Almeida', info: 'Investidor · 3 imóveis', cor: '#7c3aed', foto: 'avatar-2.jpg', texto: 'A análise de rentabilidade que recebi foi decisiva. Hoje tenho três imóveis alugados com retorno acima do mercado.' },
    { nome: 'Família Nogueira', info: 'Vendeu casa em Curitiba', cor: '#b45309', foto: 'avatar-3.jpg', texto: 'Anunciaram numa sexta e em 20 dias já tínhamos proposta acima do pedido. Fotos profissionais fizeram toda a diferença.' },
    { nome: 'Juliana Prado', info: 'Alugou loft em POA', cor: '#be123c', foto: 'avatar-4.jpg', texto: 'Processo 100% digital, sem fiador e sem dor de cabeça. Assinei o contrato no mesmo dia da visita. Recomendo de olhos fechados.' },
  ];

  /* ---------- Estado dos filtros ---------- */
  const state = { op: '', tipo: '', cidade: '', q: '', sort: 'relevancia' };
  let cidades = [];

  /* Texto usado na busca livre: código, título, tipo, bairro, cidade e UF */
  function textoBusca(im) {
    return [im.codigo, im.titulo, im.tipo, im.bairro, im.cidade, im.uf]
      .filter(Boolean).join(' ').toLowerCase();
  }

  /* ---------- Render: grade ---------- */
  const grid = $('#grid');
  const emptyState = $('#emptyState');
  const resultsCount = $('#resultsCount');

  function specRow(im) {
    const parts = [];
    if (im.quartos) parts.push(`<span><svg width="16" height="16"><use href="#i-bed"/></svg>${im.quartos} quarto${im.quartos > 1 ? 's' : ''}</span>`);
    if (im.vagas) parts.push(`<span><svg width="16" height="16"><use href="#i-car"/></svg>${im.vagas} vaga${im.vagas > 1 ? 's' : ''}</span>`);
    parts.push(`<span><svg width="16" height="16"><use href="#i-area"/></svg>${im.area} m²</span>`);
    return parts.join('');
  }

  function precoFmt(im) {
    return im.operacao === 'aluguel'
      ? `${BRL.format(im.preco)}<small>/mês</small>`
      : BRL.format(im.preco);
  }

  /* Extensão da galeria: troque para '.webp' se converter todas as fotos */
  const EXT_FOTOS = '.jpg';
  /* URL direta (sem <source>: referenciar um .webp inexistente quebra o <picture>) */
  function resolveImg(src) {
    if (!src) return '';
    if (src.startsWith('data:')) return src;
    if (/\.(jpe?g|png|gif|webp)$/i.test(src)) return src;
    return src + EXT_FOTOS;
  }
  function pictureHTML(src, alt, lazy = true) {
    const img = resolveImg(src);
    if (!img) return '';
    return `<picture><img src="${img}" alt="${alt}"${lazy ? ' loading="lazy"' : ''} onerror="this.closest('picture').remove()"></picture>`;
  }
  function fotoURL(im, n) {
    if (Array.isArray(im.fotos)) return im.fotos[n - 1] || null;
    return (typeof im.id === 'number') ? `assets/img/imovel-${im.id}-${n}${EXT_FOTOS}` : null;
  }
  function capaURL(im) {
    for (let n = 1; n <= G_MAX; n++) {
      const u = fotoURL(im, n);
      if (u) return u;
    }
    return null;
  }

  function foto(im) {
    const cor = im.cor || ['#0e7c66', '#14b8a6'];
    const capa = capaURL(im);
    return `<div class="ph" style="background:linear-gradient(135deg, ${cor[0]}, ${cor[1]})" aria-hidden="true"></div>`
      + (capa ? pictureHTML(capa, 'Foto de ' + im.titulo) : '');
  }

  function filtrados() {
    const q = state.q.trim().toLowerCase();
    let list = IMOVEIS.filter(im =>
      (!state.op || im.operacao === state.op) &&
      (!state.tipo || im.tipo === state.tipo) &&
      (!state.cidade || im.cidade === state.cidade) &&
      (!q || textoBusca(im).includes(q))
    );
    if (state.sort === 'menor') list = [...list].sort((a, b) => a.preco - b.preco);
    if (state.sort === 'maior') list = [...list].sort((a, b) => b.preco - a.preco);
    if (state.sort === 'area') list = [...list].sort((a, b) => b.area - a.area);
    if (state.sort === 'relevancia') list = [...list].sort((a, b) => (b.destaque - a.destaque) || (b.novo - a.novo));
    return list;
  }

  function render() {
    atualizarCidades();
    const list = filtrados();
    resultsCount.textContent = list.length
      ? `${list.length} ${list.length === 1 ? 'imóvel encontrado' : 'imóveis encontrados'}`
      : '';
    emptyState.hidden = list.length > 0;
    grid.innerHTML = list.map(im => `
      <article class="card" tabindex="0" role="button" data-id="${im.id}"
        aria-label="Ver detalhes de ${esc(im.titulo)}">
        <div class="card__media">
          ${foto(im)}
          <span class="card__view">Ver detalhes →</span>
          <div class="card__tags">
            <span class="badge badge--${im.operacao}">${im.operacao === 'venda' ? 'Venda' : 'Aluguel'}</span>
            ${im.destaque ? '<span class="badge badge--destaque">Destaque</span>' : ''}
            ${im.novo ? '<span class="badge badge--novo">Novo</span>' : ''}
          </div>
        </div>
        <div class="card__body">
          <div class="card__head">
            <span class="card__type">${esc(im.tipo)}</span>
            <span class="card__code" title="Código do imóvel">${esc(im.codigo || '')}</span>
          </div>
          <h3 class="card__title">${esc(im.titulo)}</h3>
          <p class="card__loc"><svg width="15" height="15"><use href="#i-pin"/></svg>${esc(im.bairro)} · ${esc(im.cidade)}/${esc(im.uf)}</p>
          <p class="card__price">${precoFmt(im)}</p>
          <div class="card__specs">${specRow(im)}</div>
        </div>
      </article>`).join('');
  }

  grid.addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (card) openModal(card.dataset.id);
  });
  grid.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) {
      e.preventDefault();
      openModal(e.target.dataset.id);
    }
  });

  /* ---------- Filtros ---------- */
  const fCidade = $('#fCidade');
  function atualizarCidades() {
    cidades = [...new Set(IMOVEIS.map((i) => i.cidade).filter(Boolean))].sort();
    fCidade.innerHTML = '<option value="">Todas as cidades</option>';
    cidades.forEach((c) => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      fCidade.appendChild(o);
    });
    fCidade.value = cidades.includes(state.cidade) ? state.cidade : '';
  }

  $('#opChips').addEventListener('click', e => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    $$('#opChips .chip').forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.op = btn.dataset.op;
    render();
  });
  $('#fTipo').addEventListener('change', e => { state.tipo = e.target.value; render(); });
  fCidade.addEventListener('change', e => { state.cidade = e.target.value; render(); });
  $('#fSort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('#fBusca').addEventListener('input', e => { state.q = e.target.value; render(); });
  $('#clearFilters').addEventListener('click', () => {
    state.op = state.tipo = state.cidade = '';
    state.q = '';
    state.sort = 'relevancia';
    $$('#opChips .chip').forEach((c, i) => c.classList.toggle('is-active', i === 0));
    $('#fTipo').value = ''; fCidade.value = ''; $('#fSort').value = 'relevancia';
    $('#fBusca').value = '';
    render();
  });

  $('#heroSearch').addEventListener('submit', e => {
    e.preventDefault();
    const cidade = $('#qCidade').value.trim();
    state.tipo = $('#qTipo').value;
    state.op = $('#qOp').value;
    state.cidade = cidades.find(c => c.toLowerCase() === cidade.toLowerCase()) || '';
    state.q = '';
    $('#fBusca').value = '';
    $$('#opChips .chip').forEach(c => c.classList.toggle('is-active', c.dataset.op === state.op));
    $('#fTipo').value = state.tipo;
    fCidade.value = state.cidade;
    render();
    $('#imoveis').scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- Modal ---------- */
  const modal = $('#modal');
  let lastFocus = null;

  function openModal(id) {
    const im = IMOVEIS.find(i => String(i.id) === String(id));
    if (!im) return;
    lastFocus = document.activeElement;
    $('#modalOp').className = 'badge badge--' + im.operacao;
    $('#modalOp').textContent = im.operacao === 'venda' ? 'Venda' : 'Aluguel';
    $('#modalTitle').textContent = im.titulo;
    $('#modalCode').textContent = im.codigo ? `Cód. ${im.codigo}` : '';
    $('#modalLoc').textContent = `${im.tipo || ''} · ${im.bairro || ''}, ${im.cidade || ''}/${im.uf || ''}`;
    $('#modalPrice').innerHTML = precoFmt(im);
    $('#modalSpecs').innerHTML = specRow(im);
    $('#modalDesc').textContent = im.desc;
    buildGallery(im);
    $('#modalFeatures').innerHTML = (im.feats || []).map(f =>
      `<li><svg width="18" height="18"><use href="#i-check"/></svg>${esc(f)}</li>`).join('');
    $('#modalCta').dataset.titulo = im.titulo;
    $('#modalCta').dataset.codigo = im.codigo || '';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#modalClose').focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target.hasAttribute('data-close-modal')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowRight') nextPhoto();
    if (e.key === 'ArrowLeft') prevPhoto();
  });
  $('#modalCta').addEventListener('click', e => {
    const titulo = e.currentTarget.dataset.titulo || '';
    const codigo = e.currentTarget.dataset.codigo || '';
    closeModal();
    $('#cAssunto').selectedIndex = 0;
    $('#cMsg').value = `Olá! Tenho interesse no imóvel "${titulo}"${codigo ? ` (cód. ${codigo})` : ''}. Gostaria de agendar uma visita.`;
    $('#contato').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => $('#cNome').focus({ preventScroll: true }), 600);
  });

  /* ---------- Galeria do modal (até 5 fotos: imovel-{id}-{n}.jpg/.webp) ---------- */
  let gIdx = 0;
  const gSlides = () => $$('#modalTrack .modal__slide');

  function refreshGallery() {
    const s = gSlides();
    const multi = s.length > 1;
    $('#modalGallery').style.display = s.length ? '' : 'none';
    $('#modalPrev').style.display = multi ? '' : 'none';
    $('#modalNext').style.display = multi ? '' : 'none';
    $('#modalCount').style.display = multi ? '' : 'none';
    $('#modalDots').style.display = multi ? '' : 'none';
    if (!s.length) return;
    gIdx = Math.max(0, Math.min(gIdx, s.length - 1));
    $('#modalTrack').style.transform = `translateX(-${gIdx * 100}%)`;
    $('#modalCount').textContent = `${gIdx + 1} / ${s.length}`;
    $('#modalDots').innerHTML = s.map((_, i) =>
      `<button type="button" aria-label="Ver foto ${i + 1}" data-i="${i}" class="${i === gIdx ? 'is-active' : ''}"></button>`).join('');
  }

  function buildGallery(im) {
    gIdx = 0;
    const track = $('#modalTrack');
    track.style.transform = 'translateX(0)';
    track.innerHTML = '';
    for (let n = 1; n <= G_MAX; n++) {
      const url = fotoURL(im, n);
      if (!url) continue;
      const src = resolveImg(url);
      if (!src) continue;
      const slide = document.createElement('div');
      slide.className = 'modal__slide';
      slide.innerHTML = `<img src="${src}" alt="Foto ${n} de ${esc(im.titulo)}">`;
      slide.querySelector('img').addEventListener('error', () => { slide.remove(); refreshGallery(); });
      track.appendChild(slide);
    }
    refreshGallery();
  }

  function goPhoto(d) {
    const s = gSlides();
    if (!s.length) return;
    gIdx = (gIdx + d + s.length) % s.length;
    refreshGallery();
  }
  function nextPhoto() { goPhoto(1); }
  function prevPhoto() { goPhoto(-1); }
  $('#modalPrev').addEventListener('click', prevPhoto);
  $('#modalNext').addEventListener('click', nextPhoto);
  $('#modalDots').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { gIdx = +b.dataset.i; refreshGallery(); }
  });
  let touchX = null;
  $('#modalTrack').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#modalTrack').addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 40) return;
    goPhoto(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ---------- Depoimentos ---------- */
  const track = $('#slideTrack');
  const dots = $('#slideDots');
  let slideIdx = 0, timer = null;
  track.innerHTML = DEPOIMENTOS.map(d => `
    <div class="slide"><div class="slide__box">
      <div class="slide__avatar" style="background:${d.cor}"><span aria-hidden="true">${d.nome[0]}</span>${pictureHTML('assets/img/' + d.foto, 'Foto de ' + d.nome)}</div>
      <div class="slide__stars">${'<svg width="16" height="16"><use href="#i-star"/></svg>'.repeat(5)}</div>
      <blockquote>“${d.texto}”</blockquote>
      <div class="slide__who"><strong>${d.nome}</strong><span>${d.info}</span></div>
    </div></div>`).join('');
  dots.innerHTML = DEPOIMENTOS.map((_, i) =>
    `<button type="button" role="tab" aria-label="Depoimento ${i + 1}" data-i="${i}"></button>`).join('');
  function goSlide(i) {
    slideIdx = (i + DEPOIMENTOS.length) % DEPOIMENTOS.length;
    track.style.transform = `translateX(-${slideIdx * 100}%)`;
    $$('#slideDots button').forEach((b, j) => b.classList.toggle('is-active', j === slideIdx));
  }
  function autoSlide() { clearInterval(timer); timer = setInterval(() => goSlide(slideIdx + 1), 6000); }
  $('#slidePrev').addEventListener('click', () => { goSlide(slideIdx - 1); autoSlide(); });
  $('#slideNext').addEventListener('click', () => { goSlide(slideIdx + 1); autoSlide(); });
  dots.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) { goSlide(+b.dataset.i); autoSlide(); }
  });
  $('#slider').addEventListener('mouseenter', () => clearInterval(timer));
  $('#slider').addEventListener('mouseleave', autoSlide);
  goSlide(0); autoSlide();

  /* ---------- Simulador ---------- */
  $('#simForm').addEventListener('submit', e => {
    e.preventDefault();
    const valor = Math.max(0, +$('#simValor').value || 0);
    const entrada = Math.max(0, +$('#simEntrada').value || 0);
    const n = +$('#simPrazo').value;
    const P = Math.max(0, valor - entrada);
    const i = 0.105 / 12; // 10,5% a.a.
    const parcela = P > 0 ? (P * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1) : 0;
    $('#simParcela').textContent = BRL.format(parcela);
    $('#simTotal').textContent = BRL.format(parcela * n + entrada);
    $('#simResult').hidden = false;
  });

  /* ---------- Formulário de contato ---------- */
  const toast = $('#toast');
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => { toast.hidden = true; }, 4000);
  }
  function setError(id, msg) {
    const input = $('#' + id);
    const err = document.querySelector(`[data-error-for="${id}"]`);
    if (err) err.textContent = msg || '';
    if (input) input.classList.toggle('is-invalid', !!msg);
    return !msg;
  }
  $('#cFone').addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 6) e.target.value = `(${v.slice(0, 2)}) ${v.slice(2, v.length > 10 ? 7 : 6)}-${v.slice(v.length > 10 ? 7 : 6)}`;
    else if (v.length > 2) e.target.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    else e.target.value = v;
  });
  $('#contactForm').addEventListener('submit', e => {
    e.preventDefault();
    const nome = $('#cNome').value.trim();
    const fone = $('#cFone').value.replace(/\D/g, '');
    const email = $('#cEmail').value.trim();
    const msg = $('#cMsg').value.trim();
    let ok = true;
    ok = setError('cNome', nome.length < 3 ? 'Informe seu nome completo.' : '') && ok;
    ok = setError('cFone', fone.length < 10 ? 'Informe um WhatsApp válido com DDD.' : '') && ok;
    ok = setError('cEmail', !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? 'Informe um e-mail válido.' : '') && ok;
    ok = setError('cMsg', msg.length < 10 ? 'Conte um pouco mais (mín. 10 caracteres).' : '') && ok;
    if (!ok) { $('.field input.is-invalid, .field textarea.is-invalid')?.focus(); return; }
    e.target.reset();
    showToast(`Obrigado, ${nome.split(' ')[0]}! Recebemos sua mensagem e retornaremos em breve.`);
  });

  /* ---------- Tema ---------- */
  const root = document.documentElement;
  /* PALETA-TESTE: 'logo' é o tema temporário com as cores do logo */
  const TEMAS = ['light', 'dark', 'logo'];
  const ROTULOS = {
    light: 'Alternar tema — atual: claro',
    dark: 'Alternar tema — atual: escuro',
    logo: 'Alternar tema — atual: cores do logo',
  };
  let salvo = null;
  try { salvo = localStorage.getItem('vivalar-theme'); } catch (_) { /* storage indisponível */ }
  const temaUrl = new URLSearchParams(location.search).get('tema'); /* PALETA-TESTE */
  const inicial = TEMAS.includes(temaUrl) ? temaUrl : salvo;        /* PALETA-TESTE */
  root.dataset.theme = (inicial && TEMAS.includes(inicial))
    ? inicial
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const btnTema = $('#themeToggle');
  function aplicarTema(t) {
    root.dataset.theme = t;
    try { localStorage.setItem('vivalar-theme', t); } catch (_) {}
    const rotulo = ROTULOS[t] || ROTULOS.light;
    btnTema.setAttribute('aria-label', rotulo);
    btnTema.title = rotulo;
  }
  aplicarTema(root.dataset.theme);
  btnTema.addEventListener('click', () => {
    aplicarTema(TEMAS[(TEMAS.indexOf(root.dataset.theme) + 1) % TEMAS.length] || 'light');
  });

  /* ---------- Menu mobile ---------- */
  const hamburger = $('#hamburger');
  const nav = $('#nav');
  hamburger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    hamburger.classList.toggle('is-open', open);
    hamburger.setAttribute('aria-expanded', open);
    hamburger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
  nav.addEventListener('click', e => {
    if (e.target.closest('a')) {
      nav.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- Scroll: header ativo, reveal, contadores, topo ---------- */
  const backTop = $('#backTop');
  window.addEventListener('scroll', () => {
    backTop.hidden = window.scrollY < 600;
    const ids = ['inicio', 'imoveis', 'sobre', 'servicos', 'depoimentos', 'contato'];
    let current = 'inicio';
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 120) current = id;
    });
    $$('.nav__link').forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + current));
  }, { passive: true });
  backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-visible'); revealObs.unobserve(en.target); } });
  }, { threshold: 0.12 });
  $$('.reveal').forEach(el => revealObs.observe(el));

  function animateCount(el) {
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || '';
    const dur = 1400, t0 = performance.now();
    function tick(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('pt-BR') + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const countObs = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { animateCount(en.target); countObs.unobserve(en.target); } });
  }, { threshold: 0.5 });
  $$('[data-count]').forEach(el => countObs.observe(el));

  /* ---------- WhatsApp: TROQUE pelo número real (DDI+DDD+número, só dígitos) ---------- */
  const WHATSAPP_NUMERO = 5519991475411
  const WHATSAPP_MSG = 'Olá! Vim pelo site Corretores de Imóveis e quero falar sobre imóveis.';
  const whatsFloat = $('#whatsFloat');
  if (whatsFloat) whatsFloat.href = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_MSG)}`;

  /* ---------- Init ---------- */
  $('#year').textContent = new Date().getFullYear();
  render();
})();
