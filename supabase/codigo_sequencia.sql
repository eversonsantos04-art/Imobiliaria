/* ================================================================
   CÓDIGO DE REFERÊNCIA — número que JAMAIS volta
   ----------------------------------------------------------------
   IMPORTANTE: abra uma JANELA NOVA de consulta no SQL Editor e
   cole SOMENTE este arquivo (o erro anterior "permission denied
   for schema public" na linha 33 indicava conteúdo de outra
   consulta misturado na mesma janela).

   Idempotente: pode rodar mais de uma vez.

   • Não cria tabela nenhuma — só uma função.
   • O próximo número é calculado a partir dos imóveis atuais MAIS
     todo o histórico (audit_log), onde ficam os códigos também dos
     imóveis já excluídos. Assim um número emitido jamais volta
     (emitiu VL-014, excluiu, o próximo é VL-015).
   • Só quem está logado pode chamar (o visitante não precisa).
   • O painel passa a usar isso automaticamente depois de rodar;
     até lá continua gerando pelo cálculo local.
   ================================================================ */

-- volta ao papel de verdade da conexão (desfaz qualquer "set role"
-- authenticated" que tenha sobrado na janela ou vindo do editor)
reset role;

-- deixa registrado quem está rodando (papel / sessão / permissão)
select current_user as papel, session_user as sessao,
       has_schema_privilege(current_user, 'public', 'CREATE') as pode_criar;

-- por garantia: se uma versão antiga (com parâmetro) existir, sai da frente
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
  -- maior código VL já emitido: entre os imóveis que existem hoje
  -- e todo o histórico (aqui estão também os de excluídos)
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

  -- primeiro número depois do maior já usado (nunca reaproveita)
  prox := max_atual + 1;
  return 'VL-' || lpad(prox::text, greatest(3, length(prox::text)), '0');
end $$;

-- só quem está logado gera código (o visitante não precisa)
revoke execute on function public.proximo_codigo() from public;
revoke execute on function public.proximo_codigo() from anon;
grant execute on function public.proximo_codigo() to authenticated;

-- o PostgREST recarrega o schema e já enxerga a função
notify pgrst, 'reload schema';
