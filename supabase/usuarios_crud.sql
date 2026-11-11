/* =================================================================
   VivaLar — EDITAR e EXCLUIR USUARIOS (so admin)
   -----------------------------------------------------------------
   COMO USAR: SQL Editor -> cole -> Run  (pode rodar mais de uma vez)
   -----------------------------------------------------------------
   Cria duas funcoes chamadas pela aba "Usuarios" do painel:
     - atualizar_usuario(p_id, p_email, p_nome, p_papel)
     - excluir_usuario(p_id)

   Seguranca: ambas sao security definer e conferem eh_admin()
   DENTRO do banco — quem nao e admin recebe erro do proprio banco,
   mesmo que alguem force a chamada direto na API.

   A exclusao apaga a linha em auth.users e public.perfis sai em
   cascata (fk on delete cascade). public.imoveis e public.audit_log
   NAO tem fk para perfis, entao os imoveis e o HISTORICO ficam
   intactos — como manda a regra do projeto.
   ================================================================= */

/* -----------------------------------------------------------------
   1) EDITAR — nome, e-mail e papel
   ----------------------------------------------------------------- */
create or replace function public.atualizar_usuario(
  p_id    uuid,
  p_email text,
  p_nome  text,
  p_papel text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  /* só admin passa */
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode editar usuários.';
  end if;

  if p_id is null then
    raise exception 'Usuário não informado.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Você não pode editar a própria conta.';
  end if;

  /* validações */
  p_email := lower(trim(coalesce(p_email, '')));
  p_nome  := nullif(trim(coalesce(p_nome, '')), '');
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'E-mail inválido.';
  end if;
  if p_nome is null then
    raise exception 'Informe o nome do usuário.';
  end if;
  if p_papel is null or p_papel not in ('admin', 'corretor') then
    raise exception 'Papel inválido.';
  end if;

  if not exists (select 1 from public.perfis where id = p_id) then
    raise exception 'Usuário não encontrado.';
  end if;

  if exists (select 1 from public.perfis where email = p_email and id <> p_id) then
    raise exception 'Já existe um usuário com esse e-mail.';
  end if;

  /* nunca rebaixa o último administrador */
  if p_papel <> 'admin'
     and not exists (select 1 from public.perfis where papel = 'admin' and id <> p_id) then
    raise exception 'Não é possível rebaixar o último administrador.';
  end if;

  /* troca o e-mail no Supabase Auth (já confirmado: o admin garante) */
  update auth.users
     set email               = p_email,
         email_confirmed_at  = coalesce(email_confirmed_at, now()),
         raw_user_meta_data  = coalesce(raw_user_meta_data, '{}'::jsonb)
                               || jsonb_build_object('nome', p_nome, 'papel', p_papel),
         updated_at          = now()
   where id = p_id;

  /* espelha em public.perfis (é daí que o painel lê) */
  update public.perfis
     set nome = p_nome, email = p_email, papel = p_papel
   where id = p_id;
end;
$$;

/* -----------------------------------------------------------------
   2) EXCLUIR — apaga a conta (perfis sai em cascata)
   ----------------------------------------------------------------- */
create or replace function public.excluir_usuario(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nome  text;
  v_email text;
  v_papel text;
begin
  /* só admin passa */
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode excluir usuários.';
  end if;

  if p_id is null then
    raise exception 'Usuário não informado.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Você não pode excluir a própria conta.';
  end if;

  select nome, email, papel into v_nome, v_email, v_papel
    from public.perfis
   where id = p_id;
  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  /* nunca exclui o último administrador */
  if v_papel = 'admin'
     and not exists (select 1 from public.perfis where papel = 'admin' and id <> p_id) then
    raise exception 'Não é possível excluir o último administrador.';
  end if;

  delete from auth.users where id = p_id;   /* public.perfis sai em cascata */

  return coalesce(v_nome, v_email);
end;
$$;

/* -----------------------------------------------------------------
   3) Permissões: anônimo não executa; logado executa
      (e dentro da função o eh_admin() decide)
   ----------------------------------------------------------------- */
revoke execute on function public.atualizar_usuario(uuid, text, text, text) from public;
revoke execute on function public.atualizar_usuario(uuid, text, text, text) from anon;
grant  execute on function public.atualizar_usuario(uuid, text, text, text) to authenticated;

revoke execute on function public.excluir_usuario(uuid) from public;
revoke execute on function public.excluir_usuario(uuid) from anon;
grant  execute on function public.excluir_usuario(uuid) to authenticated;

/* -----------------------------------------------------------------
   4) Conferição: devem aparecer 2 linhas
   ----------------------------------------------------------------- */
select p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('atualizar_usuario', 'excluir_usuario')
order by 1;
