/* =================================================================
   VivaLar / Corretores de Imóveis — SCHEMA DO SUPABASE
   -----------------------------------------------------------------
   COMO USAR:
     1. Supabase Dashboard -> SQL Editor -> New query
     2. Cole TODO este arquivo e clique em "Run"
     3. É seguro rodar mais de uma vez (tudo é idempotente)
     4. Depois rode o arquivo supabase/seed.sql (os 12 imoveis)
   -----------------------------------------------------------------
   O QUE ESTE ARQUIVO CRIA:
     - public.perfis    -> quem e quem (admin x corretor)
     - public.imoveis   -> o catalogo
     - public.audit_log -> HISTORICO de quem cadastrou/alterou/excluiu
     - trigger de auditoria (gravado pelo BANCO, nao pelo navegador)
     - RLS (quem pode ler/escrever cada tabela)
   ================================================================= */


/* -----------------------------------------------------------------
   1) PERFIS — quem e quem
   ----------------------------------------------------------------- */
create table if not exists public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text,
  email     text,
  papel     text not null default 'corretor' check (papel in ('admin', 'corretor')),
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table public.perfis is 'Um registro por usuario do Supabase Auth. papel: admin ou corretor.';


/* -----------------------------------------------------------------
   2) IMOVEIS — o catalogo
   ----------------------------------------------------------------- */
create table if not exists public.imoveis (
  id           uuid primary key default gen_random_uuid(),
  codigo       text unique,
  titulo       text not null,
  tipo         text not null default 'Apartamento'
               check (tipo in ('Apartamento','Casa','Cobertura','Loft','Sala Comercial','Terreno')),
  operacao     text not null default 'venda' check (operacao in ('venda','aluguel')),
  preco        numeric(12,2) not null default 0,
  area         numeric(10,2) not null default 0,
  cidade       text not null default '',
  bairro       text not null default '',
  uf           text not null default '' check (uf ~ '^[A-Za-z]{2}$'),
  quartos      integer not null default 0,
  vagas        integer not null default 0,
  destaque     boolean not null default false,
  novo         boolean not null default false,
  ativo        boolean not null default true,   -- false = escondido do site
  cor          jsonb,               -- ["#0e7c66","#14b8a6"]
  descricao    text,                -- o "desc" do formulario (desc = palavra reservada do SQL)
  feats        jsonb,               -- ["Piscina","Varanda gourmet"]
  fotos        jsonb,               -- caminhos locais e/ou URLs do Storage
  criado_por   uuid,                -- auth.uid() de quem cadastrou
  criado_em    timestamptz not null default now(),
  alterado_por uuid,                -- auth.uid() de quem alterou por ultimo
  alterado_em  timestamptz
);

comment on column public.imoveis.fotos is 'Array de strings. Aceita caminho local (assets/img/...) e URL do Storage no mesmo imovel.';

/* bancos criados antes da coluna `ativo` ganham ela aqui (idempotente) */
alter table public.imoveis
  add column if not exists ativo boolean not null default true;


/* -----------------------------------------------------------------
   3) AUDIT_LOG — historico de quem cadastrou / alterou / excluiu
   Guarda uma COPIA COMPLETA do registro, entao imovel excluido
   continua consultavel aqui.
   ----------------------------------------------------------------- */
create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  acao          text not null check (acao in ('INSERT','UPDATE','DELETE')),
  registro_id   uuid,
  dados_novos   jsonb,
  dados_antigos jsonb,
  usuario_id    uuid,
  usuario_email text,
  em            timestamptz not null default now()
);

comment on table public.audit_log is 'Historico imutavel. Escrita apenas via trigger (nenhum usuario escreve aqui direto).';


/* -----------------------------------------------------------------
   4) FUNCOES
   ----------------------------------------------------------------- */

/* 4.1 admin: papel do usuario logado. security definer evita o
      "infinite recursion" que ocorre quando a politica de perfis
      consulta a propria tabela perfis. */
create or replace function public.eh_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'admin' and ativo
  );
$$;

revoke execute on function public.eh_admin() from public;
grant execute on function public.eh_admin() to authenticated;


/* 4.2 Auditoria: roda NO BANCO, depois da escrita.
      Nao depende do navegador — vale para qualquer caminho de escrita. */
create or replace function public.fn_audit()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text;
begin
  if v_uid is not null then
    select email into v_email from auth.users where id = v_uid;
  end if;

  if TG_OP = 'INSERT' then
    insert into public.audit_log (acao, registro_id, dados_novos, usuario_id, usuario_email)
    values ('INSERT', new.id, to_jsonb(new), v_uid, coalesce(v_email, 'sistema'));
    return new;

  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (acao, registro_id, dados_novos, dados_antigos, usuario_id, usuario_email)
    values ('UPDATE', new.id, to_jsonb(new), to_jsonb(old), v_uid, coalesce(v_email, 'sistema'));
    return new;

  else
    insert into public.audit_log (acao, registro_id, dados_antigos, usuario_id, usuario_email)
    values ('DELETE', old.id, to_jsonb(old), v_uid, coalesce(v_email, 'sistema'));
    return old;
  end if;
end;
$$;


/* 4.3 Colunas de auditoria do imovel: preenchidas pelo banco,
      o painel nao precisa se preocupar com isso. */
create or replace function public.fn_imoveis_meta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if new.criado_por is null then
      new.criado_por := auth.uid();
    end if;
    if new.criado_em is null then
      new.criado_em := now();
    end if;
  else
    -- id e autoria sao imutaveis
    new.id          := old.id;
    new.criado_por  := old.criado_por;
    new.criado_em   := old.criado_em;
    new.alterado_por := auth.uid();
    new.alterado_em  := now();
  end if;
  return new;
end;
$$;


/* 4.4 Cria o perfil automaticamente quando nasce um usuario no Auth.
      Default: papel 'corretor' (so o admin promove). */
create or replace function public.fn_novo_usuario()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, email, nome, papel)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''),
             split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(nullif(new.raw_user_meta_data ->> 'papel', ''), 'corretor')
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'fn_novo_usuario: %', sqlerrm;
  return new;
end;
$$;


/* -----------------------------------------------------------------
   5) TRIGGERS
   ----------------------------------------------------------------- */
drop trigger if exists trg_imoveis_meta on public.imoveis;
create trigger trg_imoveis_meta
  before insert or update on public.imoveis
  for each row execute function public.fn_imoveis_meta();

drop trigger if exists trg_imoveis_audit on public.imoveis;
create trigger trg_imoveis_audit
  after insert or update or delete on public.imoveis
  for each row execute function public.fn_audit();

drop trigger if exists trg_novo_usuario on auth.users;
create trigger trg_novo_usuario
  after insert on auth.users
  for each row execute function public.fn_novo_usuario();


/* -----------------------------------------------------------------
   6) RETROCOMPATIBILIDADE: cria perfis para usuarios que ja existiam
   ----------------------------------------------------------------- */
insert into public.perfis (id, email, nome, papel)
select u.id,
       u.email,
       coalesce(nullif(u.raw_user_meta_data ->> 'nome', ''),
                split_part(coalesce(u.email, ''), '@', 1)),
       coalesce(nullif(u.raw_user_meta_data ->> 'papel', ''), 'corretor')
from auth.users u
on conflict (id) do nothing;


/* -----------------------------------------------------------------
   7) ROW LEVEL SECURITY (a protecao real: vale mesmo que alguem
      chame a API direto, escondendo o HTML nao protege nada)
   ----------------------------------------------------------------- */
alter table public.imoveis  enable row level security;
alter table public.perfis   enable row level security;
alter table public.audit_log enable row level security;

-- imoveis: visitante LE so os ATIVOS; quem esta logado ve todos e CRUDA
drop policy if exists "imoveis_select" on public.imoveis;
create policy "imoveis_select" on public.imoveis
  for select to anon, authenticated
  using (ativo = true or auth.uid() is not null);

drop policy if exists "imoveis_insert" on public.imoveis;
create policy "imoveis_insert" on public.imoveis
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists "imoveis_update" on public.imoveis;
create policy "imoveis_update" on public.imoveis
  for update to authenticated using (true) with check (true);

drop policy if exists "imoveis_delete" on public.imoveis;
create policy "imoveis_delete" on public.imoveis
  for delete to authenticated using (true);

-- perfis: voce ve o seu; so admin ve e mexe nos demais
drop policy if exists "perfis_select" on public.perfis;
create policy "perfis_select" on public.perfis
  for select to authenticated using (id = auth.uid() or public.eh_admin());

drop policy if exists "perfis_insert" on public.perfis;
create policy "perfis_insert" on public.perfis
  for insert to authenticated with check (public.eh_admin());

drop policy if exists "perfis_update" on public.perfis;
create policy "perfis_update" on public.perfis
  for update to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists "perfis_delete" on public.perfis;
create policy "perfis_delete" on public.perfis
  for delete to authenticated using (public.eh_admin());

-- audit_log: so leitura para quem esta logado; gravacao so pelo trigger
drop policy if exists "audit_select" on public.audit_log;
create policy "audit_select" on public.audit_log
  for select to authenticated using (true);

-- defesa extra: anon nao escreve nada
revoke insert, update, delete on public.imoveis  from anon;
revoke insert, update, delete on public.perfis   from anon;
revoke insert, update, delete on public.audit_log from anon;


/* -----------------------------------------------------------------
   8) PERMISSOES EXPLICITAS (PostgREST)
   ----------------------------------------------------------------- */
grant usage on schema public to anon, authenticated;
grant select on public.imoveis to anon;
grant select, insert, update, delete on public.imoveis to authenticated;
grant select, insert, update, delete on public.perfis to authenticated;
grant select on public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;


/* -----------------------------------------------------------------
   9) INDICES
   ----------------------------------------------------------------- */
create index if not exists idx_imoveis_codigo   on public.imoveis (codigo);
create index if not exists idx_imoveis_operacao on public.imoveis (operacao);
create index if not exists idx_imoveis_cidade   on public.imoveis (cidade);
create index if not exists idx_imoveis_criado   on public.imoveis (criado_em desc);
create index if not exists idx_audit_em         on public.audit_log (em desc);
create index if not exists idx_audit_registro   on public.audit_log (registro_id);
create index if not exists idx_perfis_papel     on public.perfis (papel);


/* -----------------------------------------------------------------
   10) CÓDIGO DE REFERÊNCIA: número que JAMAIS reutiliza (nem de
       imóveis excluídos). O painel chama proximo_codigo().
       Sem tabela nova: o próximo número sai dos imóveis atuais +
       todo o histórico (audit_log), onde ficam os códigos também
       dos imóveis já excluídos.
   ----------------------------------------------------------------- */
drop function if exists public.proximo_codigo(boolean);

create or replace function public.proximo_codigo()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  max_atual integer;
  prox integer;
begin
  -- maior código VL já emitido: imóveis de hoje + histórico inteiro
  select coalesce(max(n), 0)
    into max_atual
  from (
    select nullif(regexp_replace(codigo, '^VL-', ''), '')::int as n
      from public.imoveis
     where codigo ~ '^VL-[0-9]+$'
    union all
    select nullif(regexp_replace(dados_novos ->> 'codigo', '^VL-', ''), '')::int
      from public.audit_log
     where dados_novos ->> 'codigo' ~ '^VL-[0-9]+$'
    union all
    select nullif(regexp_replace(dados_antigos ->> 'codigo', '^VL-', ''), '')::int
      from public.audit_log
     where dados_antigos ->> 'codigo' ~ '^VL-[0-9]+$'
  ) s;

  prox := max_atual + 1;
  return 'VL-' || lpad(prox::text, greatest(3, length(prox::text)), '0');
end $$;

revoke execute on function public.proximo_codigo() from public;
revoke execute on function public.proximo_codigo() from anon;
grant execute on function public.proximo_codigo() to authenticated;


/* =================================================================
   FIM DO SCHEMA
   Proximo passo: rode supabase/seed.sql
   Depois de criar o usuario no dashboard, promova a admin com:

     update public.perfis
        set papel = 'admin', nome = 'Laerty'
      where email = 'EMAIL-DO-LAERTY@exemplo.com';
   ================================================================= */
