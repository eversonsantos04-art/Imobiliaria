/* =================================================================
   VivaLar — HISTORICO SO PARA ADMIN
   -----------------------------------------------------------------
   COMO USAR: SQL Editor -> cole -> Run  (uma unica vez)
   -----------------------------------------------------------------
   Antes: qualquer usuario logado podia ler o audit_log (RLS "true").
   Agora: apenas quem tem papel = 'admin' enxerga o historico.
   Quem for corretor continua REGISTRANDO as proprias acoes no
   historico (o trigger roda no banco), so nao consegue VE-lo.
   ================================================================= */

drop policy if exists "audit_select" on public.audit_log;

create policy "audit_select" on public.audit_log
  for select to authenticated
  using (public.eh_admin());

/* Confericao 1: a politica nova existe e so admin passa */
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'audit_log';

/* Confericao 2 (opcional): rode DEPOIS de logar como um corretor
   no painel — deve devolver 0 linhas para corretor e >0 para admin.

   select count(*) from public.audit_log;
*/
