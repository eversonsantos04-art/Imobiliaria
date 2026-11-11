/* =================================================================
   VivaLar — STORAGE DAS FOTOS (bucket "imoveis")
   -----------------------------------------------------------------
   COMO USAR: SQL Editor -> cole -> Run  (uma unica vez)
   -----------------------------------------------------------------
   - Cria o bucket PUBLICO (a vitrine precisa ler sem login)
   - Leitura publica; upload/update/delete SO para quem esta logado
   - As fotos novas vao para /storage/v1/object/public/imoveis/{id}/N.jpg
   - As fotos antigas do catalogo continuam em assets/img/ (nao mudam)
   ================================================================= */

insert into storage.buckets (id, name, public)
values ('imoveis', 'imoveis', true)
on conflict (id) do update set public = true;

/* leitura: qualquer um (site publico) */
drop policy if exists "fotos leitura publica" on storage.objects;
create policy "fotos leitura publica" on storage.objects
  for select to public
  using (bucket_id = 'imoveis');

/* gravacao: so usuario autenticado (o corretor logado no painel) */
drop policy if exists "fotos insert" on storage.objects;
create policy "fotos insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imoveis');

drop policy if exists "fotos update" on storage.objects;
create policy "fotos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'imoveis');

drop policy if exists "fotos delete" on storage.objects;
create policy "fotos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imoveis');

/* conferencia: deve devolver 1 linha com public = true */
select id, name, public from storage.buckets where id = 'imoveis';
