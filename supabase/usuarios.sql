/* =================================================================
   VivaLar — CRIAR USUARIOS PELO PAINEL (so admin)
   -----------------------------------------------------------------
   COMO USAR: SQL Editor -> cole -> Run  (uma unica vez)
   -----------------------------------------------------------------
   Cria a funcao `criar_usuario`, chamada pela aba "Usuarios" do
   painel. Seguranca em 2 camadas:
     1) a funcao so roda se eh_admin() for verdade (o banco confere,
        nao o JavaScript);
     2) a aba nem aparece para quem nao e admin.
   O usuario nasce no Auth ja confirmado e o trigger trg_novo_usuario
   cria o perfil automaticamente com o papel escolhido.
   ================================================================= */

/* -----------------------------------------------------------------
   0) CONSERTA usuarios criados com INSERT direto
   Quem nasceu sem essas colunas fica com NULL e o Supabase Auth
   trava no login com "Database error querying schema".
   ----------------------------------------------------------------- */
update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, '')
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.criar_usuario(
  p_email text,
  p_senha text,
  p_nome  text default null,
  p_papel text default 'corretor'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_id uuid;
begin
  /* 1) Só o administrador passa */
  if not public.eh_admin() then
    raise exception 'Apenas o administrador pode criar usuários.';
  end if;

  /* 2) Validações */
  p_email := lower(trim(coalesce(p_email, '')));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'E-mail inválido.';
  end if;
  if coalesce(p_senha, '') !~ '^.{6,}$' then
    raise exception 'A senha precisa de ao menos 6 caracteres.';
  end if;
  if p_papel is null or p_papel not in ('admin', 'corretor') then
    p_papel := 'corretor';
  end if;

  /* 3) Nasce o usuário no Supabase Auth (já confirmado = entra direto).
        O trigger trg_novo_usuario cria a linha em public.perfis
        com nome e papel vindos do raw_user_meta_data. */
  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_senha, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'nome',  coalesce(nullif(trim(coalesce(p_nome, '')), ''), split_part(p_email, '@', 1)),
      'papel', p_papel
    ),
    /* tokens em '' — NULL aqui derruba o login com
       "Database error querying schema" */
    '', '', '', '', '',
    now(),
    now()
  );

  return v_id;
end;
$$;

/* Permissões: anônimo não executa; quem está logado executa
   (e dentro da função o eh_admin() decide). */
revoke execute on function public.criar_usuario(text, text, text, text) from public;
revoke execute on function public.criar_usuario(text, text, text, text) from anon;
grant  execute on function public.criar_usuario(text, text, text, text) to authenticated;

/* Conferição: deve listar a função com os 4 argumentos */
select p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'criar_usuario';
