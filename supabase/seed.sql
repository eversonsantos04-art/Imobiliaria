/* =================================================================
   VivaLar — SEED: os 12 imoveis do catalogo original
   -----------------------------------------------------------------
   COMO USAR: SQL Editor -> cole -> Run
   Depois de rodar o supabase/schema.sql.
   Seguro para rodar de novo: nao duplica (usa o codigo como chave).
   -----------------------------------------------------------------
   As fotos mantem o caminho local (assets/img/...) — por isso nao ha
   migracao de imagem. So as fotos NOVAS vao para o Storage, a partir
   da etapa de upload.
   ================================================================= */

insert into public.imoveis (codigo, titulo, tipo, operacao, preco, area, cidade, bairro, uf,
                            quartos, vagas, destaque, novo, cor, descricao, feats, fotos)
values
('VL-001', 'Apartamento Garden Residence', 'Apartamento', 'venda', 850000, 95, 'São Paulo', 'Vila Mariana', 'SP',
 3, 2, true, false,
 '["#0e7c66","#14b8a6"]',
 'Apartamento arejado com varanda gourmet, próximo ao metrô e ao Parque Ibirapuera. Condomínio com lazer completo e portaria 24h.',
 '["Varanda gourmet","Lazer completo","Portaria 24h","Próx. ao metrô"]',
 '["assets/img/imovel-1-1.jpg","assets/img/imovel-1-2.jpg","assets/img/imovel-1-3.jpg"]'),

('VL-002', 'Cobertura Sky View', 'Cobertura', 'venda', 2300000, 210, 'Rio de Janeiro', 'Copacabana', 'RJ',
 4, 3, true, false,
 '["#1d4ed8","#38bdf8"]',
 'Cobertura de alto padrão com vista definitiva para o mar, piscina privativa e terraço com churrasqueira. Acabamento premium em todos os ambientes.',
 '["Vista mar","Piscina privativa","Terraço gourmet","4 suítes"]',
 '["assets/img/imovel-2-1.jpg","assets/img/imovel-2-2.jpg","assets/img/imovel-2-3.jpg"]'),

('VL-003', 'Casa Moderna Essenza', 'Casa', 'venda', 1150000, 180, 'Curitiba', 'Bigorrilho', 'PR',
 4, 3, false, false,
 '["#b45309","#e8a33d"]',
 'Casa contemporânea com pé-direito duplo, iluminação natural abundante e quintal com deck. Bairro arborizado e familiar.',
 '["Pé-direito duplo","Deck no quintal","Cozinha planejada","Energia solar"]',
 '["assets/img/imovel-3-1.jpg","assets/img/imovel-3-2.jpg","assets/img/imovel-3-3.jpg"]'),

('VL-004', 'Studio Urbano Pinheiros', 'Apartamento', 'aluguel', 3200, 42, 'São Paulo', 'Pinheiros', 'SP',
 1, 1, false, true,
 '["#7c3aed","#a78bfa"]',
 'Studio mobiliado e funcional, ideal para quem quer praticidade perto de tudo: bares, metrô e parques. Condomínio com coworking e academia.',
 '["Mobiliado","Coworking","Academia","Pet friendly"]',
 '["assets/img/imovel-4-1.jpg","assets/img/imovel-4-2.jpg","assets/img/imovel-4-3.jpg"]'),

('VL-005', 'Casa de Condomínio Alphaville', 'Casa', 'venda', 1900000, 320, 'Campinas', 'Alphaville', 'SP',
 5, 4, true, false,
 '["#0f766e","#65a30d"]',
 'Casa espaçosa em condomínio fechado com segurança 24h, piscina, salão de festas e ampla área verde. Perfeita para famílias grandes.',
 '["Condomínio fechado","Piscina","Home office","Área verde"]',
 '["assets/img/imovel-5-1.jpg","assets/img/imovel-5-2.jpg","assets/img/imovel-5-3.jpg"]'),

('VL-006', 'Sala Comercial Savassi', 'Sala Comercial', 'aluguel', 4500, 85, 'Belo Horizonte', 'Savassi', 'MG',
 0, 2, false, false,
 '["#475569","#94a3b8"]',
 'Sala comercial em andar alto com vista livre, 2 vagas demarcadas e recepção no prédio. Região com excelente fluxo corporativo.',
 '["Andar alto","Recepção","Ar-condicionado","Copa"]',
 '["assets/img/imovel-6-1.jpg","assets/img/imovel-6-2.jpg","assets/img/imovel-6-3.jpg"]'),

('VL-007', 'Apartamento Maré Alta', 'Apartamento', 'venda', 620000, 68, 'Florianópolis', 'Campeche', 'SC',
 2, 1, false, true,
 '["#0284c7","#22d3ee"]',
 'A 300 metros da praia, com sacada voltada para o nascer do sol. Prédio novo com piscina, salão de jogos e bicicletário.',
 '["300m da praia","Prédio novo","Piscina","Bicicletário"]',
 '["assets/img/imovel-7-1.jpg","assets/img/imovel-7-2.jpg","assets/img/imovel-7-3.jpg"]'),

('VL-008', 'Terreno Residencial Bueno', 'Terreno', 'venda', 480000, 360, 'Goiânia', 'Setor Bueno', 'GO',
 0, 0, false, false,
 '["#65a30d","#a3e635"]',
 'Terreno plano em rua tranquila, pronto para construir. Documentação regularizada e infraestrutura completa no entorno.',
 '["Escritura pronta","Rua asfaltada","Pronto p/ construir"]',
 '["assets/img/imovel-8-1.jpg","assets/img/imovel-8-2.jpg","assets/img/imovel-8-3.jpg"]'),

('VL-009', 'Loft Moinhos Design', 'Loft', 'aluguel', 2800, 55, 'Porto Alegre', 'Moinhos de Vento', 'RS',
 1, 1, false, true,
 '["#be123c","#fb7185"]',
 'Loft com conceito aberto, tijolos aparentes e marcenaria sob medida. Mobiliado com peças de design, no bairro mais charmoso da cidade.',
 '["Mobiliado","Conceito aberto","Marcenaria exclusiva"]',
 '["assets/img/imovel-9-1.jpg","assets/img/imovel-9-2.jpg","assets/img/imovel-9-3.jpg"]'),

('VL-010', 'Apartamento Atlântico', 'Apartamento', 'venda', 980000, 120, 'Recife', 'Boa Viagem', 'PE',
 3, 2, false, false,
 '["#0d9488","#2dd4bf"]',
 'De frente para o mar, com ventilação cruzada e vista permanente. Lazer na cobertura e 2 vagas paralelas na garagem.',
 '["Frente mar","Vista permanente","Lazer na cobertura"]',
 '["assets/img/imovel-10-1.jpg","assets/img/imovel-10-2.jpg","assets/img/imovel-10-3.jpg"]'),

('VL-011', 'Casa Clássica Gonzaga', 'Casa', 'aluguel', 6500, 200, 'Santos', 'Gonzaga', 'SP',
 4, 3, false, false,
 '["#92400e","#d97706"]',
 'Casa clássica reformada a 2 quadras da praia, com quintal amplo, edícula e dependência completa. Ideal para moradia ou temporada estendida.',
 '["2 quadras da praia","Edícula","Quintal amplo"]',
 '["assets/img/imovel-11-1.jpg","assets/img/imovel-11-2.jpg","assets/img/imovel-11-3.jpg"]'),

('VL-012', 'Cobertura Duplex Itaim', 'Cobertura', 'venda', 3400000, 260, 'São Paulo', 'Itaim Bibi', 'SP',
 4, 4, true, true,
 '["#111827","#4b5563"]',
 'Duplex sofisticado com elevador privativo, adega climatizada e terraço com vista 360°. Automação completa e 4 vagas box.',
 '["Elevador privativo","Adega climatizada","Automação total","Vista 360°"]',
 '["assets/img/imovel-12-1.jpg","assets/img/imovel-12-2.jpg","assets/img/imovel-12-3.jpg"]')

on conflict (codigo) do nothing;

/* Conferencia rapida — deve devolver 12 */
select count(*) as total_imoveis from public.imoveis;
