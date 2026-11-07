# Imagens do site — como trocar

Para trocar qualquer imagem, **substitua o arquivo mantendo o mesmo nome**.
As imagens são referenciadas pelo caminho exato. Para usar **`.webp`**
(arquivos mais leves):

- Onde o caminho é escrito por extenso (`hero.jpg`, `sobre-1.jpg`,
  `cta.jpg`, `avatar-*.jpg`), aponte direto para o `.webp`
  correspondente.
- A galeria segue a convenção `imovel-{id}-{n}.jpg`. Para migrar
  todas as fotos para `.webp`, converta os arquivos (ex.:
  https://squoosh.app) e troque a constante `EXT_FOTOS` em
  `js/script.js` (e o fallback em `js/admin.js`) para `'.webp'`.

## Galeria dos imóveis — até 5 fotos por imóvel
`js/script.js` → função `fotoBase`. Padrão de nome:

```
assets/img/imovel-{id}-{n}.jpg   (n = 1 … 5)
```

- A **foto 1** (`imovel-5-1.jpg`) é a **capa** que aparece no card.
- As fotos 1–5 aparecem na **galeria do modal** (setas, dots, contador e swipe no celular).
- **Para adicionar fotos é só soltar o arquivo na pasta** — fotos que
  não existirem são ignoradas sozinhas, sem mexer no código.

| Base | Imóvel |
|---|---|
| `imovel-1-*` | Apartamento Garden Residence (SP) |
| `imovel-2-*` | Cobertura Sky View (RJ) |
| `imovel-3-*` | Casa Moderna Essenza (Curitiba) |
| `imovel-4-*` | Studio Urbano Pinheiros (SP) |
| `imovel-5-*` | Casa de Condomínio Alphaville (Campinas) |
| `imovel-6-*` | Sala Comercial Savassi (BH) |
| `imovel-7-*` | Apartamento Maré Alta (Florianópolis) |
| `imovel-8-*` | Terreno Residencial Bueno (Goiânia) |
| `imovel-9-*` | Loft Moinhos Design (Porto Alegre) |
| `imovel-10-*` | Apartamento Atlântico (Recife) |
| `imovel-11-*` | Casa Clássica Gonzaga (Santos) |
| `imovel-12-*` | Cobertura Duplex Itaim (SP) |

Tamanho sugerido: **1000px de largura**.

## Demais imagens do site
| Arquivo(s) | Onde é usado |
|---|---|
| `hero.jpg` / `hero.webp` | Foto principal do topo (`index.html`) — sugerido 1200px |
| `sobre-1.jpg` / `sobre-1.webp` | Foto grande da seção Sobre (`index.html`) — sugerido 800px |
| `sobre-2.jpg` / `sobre-2.webp` | Foto pequena da seção Sobre (`index.html`) — sugerido 800px |
| `cta.jpg` / `cta.webp` | Fundo da faixa "Agende uma visita" (`css/style.css`, `.cta-band`) — sugerido 1600px. Para usar `.webp` aqui, troque a extensão na linha do `background` |
| `avatar-1.jpg` … `avatar-4.jpg` (+ `.webp` opcional) | Fotos dos depoimentos (`js/script.js`, lista `DEPOIMENTOS`) — sugerido 200×200px |

## WhatsApp
Botão flutuante verde no canto inferior esquerdo. Para trocar o número,
edite `WHATSAPP_NUMERO` em `js/script.js` (formato: 55 + DDD + número,
só dígitos, ex.: `5511987654321`).

## Painel administrativo (`admin.html`)
- Link no rodapé do site: **Área do corretor**.
- **Acesso:** na primeira abertura o painel pede para **criar uma senha**
  (mínimo de 8 caracteres). Não existe senha no código: fica gravado só o
  hash com sal (`SHA-256` iterado), na chave `vivalar_admin_cred`.
- **Proteções:** sessão de 30 min (renovada ao usar), bloqueio automático
  após 15 minutos sem uso e bloqueio de 30 s após 5 senhas erradas.
- **Esqueceu a senha?** No console do navegador:
  `localStorage.removeItem('vivalar_admin_cred');`
  — reabre a criação de senha e **não** apaga os imóveis.
- Permite **cadastrar, editar e excluir** imóveis (com upload de até
  5 fotos por imóvel, otimizadas automaticamente).
- As alterações são salvas no navegador (`localStorage`) e aparecem
  no site na hora, sem mexer no código.
- Botão **Restaurar padrão** descarta as alterações e volta ao
  catálogo original (`js/dados.js`).
