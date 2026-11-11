/* -----------------------------------------------------------------
   Supabase — configuracao PUBLICA (segura no navegador)
   -----------------------------------------------------------------
   A publishable key foi feita para ir no front-end: so permite o
   que o RLS deixar. A protecao de verdade esta no supabase/schema.sql.

   NUNCA coloque aqui a Secret key (sb_secret_... ou service_role):
   essa sim da acesso total ao banco.

   Este arquivo ainda nao esta ligado no admin.html — ele passa a
   ser usado a partir da etapa 4 (login multiusuario).
   ----------------------------------------------------------------- */
window.SUPABASE_URL = 'https://bkwhuoimotzqmtanwsgv.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nYhp1MnlHnL-oWiOBPCPAg_TASh4ylb';
