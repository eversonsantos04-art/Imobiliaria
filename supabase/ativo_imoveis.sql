/* =================================================================
   VivaLar — STATUS ATIVO/INATIVO DOS IMOVEIS
   -----------------------------------------------------------------
   COMO USAR: SQL Editor -> cole -> Run  (pode rodar mais de uma vez)
   -----------------------------------------------------------------
   ativo = true   (PADRAO) -> aparece no site publico
   ativo = false            -> continua cadastrado, mas NAO aparece
                               no site; continua visivel no painel
                               e pode ser reativado quando quiser.

   Tambem ajusta a RLS de leitura:
     - visitante (anon) so ve os ATIVOS;
     - usuario logado (admin/corretor) ve TODOS, para gerenciar.
   ================================================================= */

alter table public.imoveis
  add column if not exists ativo boolean not null default true;

comment on column public.imoveis.ativo is
  'false = cadastrado, mas escondido do site publico. Padrao: true.';

/* Visitante só enxerga os ativos; quem está logado enxerga todos */
drop policy if exists "imoveis_select" on public.imoveis;
create policy "imoveis_select" on public.imoveis
  for select to anon, authenticated
  using (ativo = true or auth.uid() is not null);

/* -----------------------------------------------------------------
   Conferição: deve vir 1 linha na 1ª consulta e 1 na 2ª
   ----------------------------------------------------------------- */
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'imoveis'
  and column_name = 'ativo';

select policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename = 'imoveis'
  and policyname = 'imoveis_select';
