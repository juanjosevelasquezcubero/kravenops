# KravenOps 🦾🚪

Aplicativo mobile **para garimpo pessoal e legal** — analisa fotos de rochas/cavernas com
um "engenheiro de minérios" (IA de visão + heurística offline), orienta onde cavar e
alerta sobre **áreas protegidas e proibidas** (🔴), com verificação por PLG (permissão de
lavra garimpeira) e funcionamento **offline-first**.

> Stack: Expo SDK 57 · React 19 · React Native 0.86 · TypeScript · Expo Router · SQLite (KV) local

## ⚖️ Regra de ouro do app

| Área | Status | Comportamento |
| --- | --- | --- |
| 🔴 Protegida (FUNAI/ICMBio/UC) | `blocked` | **BLOQUEIO TOTAL** — sem análise, sem orientação de escavação. Alerta sonoro de voz. |
| 🔴 Protegida + PLG válida registrada | `verified` | Liberada (responsabilidade do operador pela legalidade). |
| 🟡 Com título ANM | `permitted` | Opera com PLG registrada. |
| 🟢 Livre | `free` | Operação permitida. |

> Dados de zonas são **demonstração** em `src/data/zones.ts`. Em produção, substitua pelos
> shapefiles oficiais: FUNAI (terras indígenas), ICMBio (unidades de conservação),
> ANM SIGMINE (títulos), CPRM (geologia), USGS MRData.

## 🚀 Rodando o projeto

```bash
npm install        # instala dependências
npx expo start     # abre o dev server (QR code no terminal)
```

Requer **Expo Go** ou dev build. GPS, câmera e voz funcionam em aparelho físico.

## 📱 Funcionalidades (Fase 1 – MVP)

- **🌍 Funciona em qualquer parte do mundo** — radar, GPS, análise e histórico são relativos à
  sua posição atual (projeção equiretangular local, sem dependência de país). As zonas são dados
  de demonstração; carregue os shapefiles do seu país (FUNAI/ICMBio/ANM no BR; USGS/nacionais
  fora) em `src/data/zones.ts`.
- **🌐 "Júpiter 3D" (Google Earth real no app)** — WebView com **dois motores**:
  - **Google Earth 3D de verdade** (recomendado): cole o token **gratuito** do Cesium ion em
    *Ajustes → Google Earth 3D* e o mapa usa os **Google Photorealistic 3D Tiles** — os MESMOS
    dados 3D (fotorealístico mundial) que alimentam o Google Earth, via CesiumJS.
  - **Reserva (sem token)**: **MapLibre GL JS** + satélite **Esri World Imagery** + **terreno 3D
    real** (tiles de elevação AWS Terrarium, mundial, sem API key).
  Gire o mapa (pitch 2D/3D 🏔️), zoom, pan e **seguir minha posição** 🎯. Requer internet.
- **🔵 Áreas de alto potencial mineral em azul** — ao abrir (ou buscar qualquer região/país), o
  app amostra o relevo da área visível (elevação/declividade/curvatura, estilo engenharia do
  terreno) e pinta em **azul** as células favoráveis. Estimativa honesta do modelo — confirme
  sempre em campo.
- **🟡🟥⬜ Pontos coloridos por minério** — o mesmo estudo marca pontos de pico por mineral:
  **ouro=amarelo, bauxita=vermelho, diamante=branco, ferro=cinza, cobre=verde, terras
  raras=laranja**. Legenda de cores fixa no rodapé com o significado.
- **🔍 Busca mundial por região/cidade/país** — geocodificação OSM (Nominatim, sem chave);
  voe até o local, o estudo de potencial roda lá também.
- **🗺️ Mapa satelital (2D)** — tiles de satélite da **Esri World Imagery** (sem API key):
  arraste (pan), zoom (＋/−), botão **seguir minha posição** 🎯, polígonos das zonas 🔴🟡🟢 e
  marcadores de análises. Requer internet para as imagens; com **📡 Radar offline** basta tocar
  para alternar.
- **📡 Radar geofence** — mapa 100% offline (sem tiles, sem API key): posição GPS no centro,
  zonas 🔴🟡🟢, análises anteriores, coordenadas e precisão.
- **🛰️ Precisão total de posição** — GPS em tempo real com `Accuracy.Highest` (atualização a cada
  2 m). **Offline-sem-sinal?** O app usa o *último sinal conhecido* do aparelho e, se nunca
  houve sinal, o *último ponto que você pediu para analisar* (persistido). A origem do fix
  aparece no radar e em cada análise (GPS ao vivo / último sinal / ponto salvo).
- **⛔ Bloqueio legal automático** — dentro de área protegida o app bloqueia a análise e o
  alerta por voz; só libera com PLG registrada nos Ajustes.
- **📷 🎬 Câmera + vídeo** — fotografe o afloramento ou grave a frente de trabalho (vídeo até
  3 min). **Escolha o mineral-alvo** (🎯 ouro, diamante, ferro, terras raras, cobre, bauxita ou
  geral) — o engenheiro foca a análise no que você procura. Marque observações (material,
  dureza, veios, sulfetos, alteração, estrutura) e receba recomendação, rumo, profundidade de
  teste e confiança.
- **💾 Mídia em escala (imagens e vídeos enormes)** — fotos/vídeos vão para o armazenamento
  **permanente** (Documentos, à prova de limpeza de cache) e o **SQLite guarda só metadados**.
  O banco aguenta milhares de registros de mídia; gerencie espaço em Ajustes → "Mídia e
  armazenamento".
- **🔎 IA + referências web** — com API de visão configurada, o app busca na internet imagens
  similares à sua rocha (Openverse, domínio público/CC) e entrega como **referência de
  comparação** para o engenheiro de minérios. **A conclusão é SEMPRE baseada no estudo da sua
  rocha/vídeo original** — as imagens da web nunca são usadas como fonte do parecer.
- **🤖 Engenheiro de Minérios** — prompt específico (IA de visão) estruturado por mineral-alvo
  com saída JSON; sem internet entra a heurística offline honesta (não inventa ouro) com
  indicadores específicos de ouro, diamante, ferro, terras raras, cobre e bauxita.
- **💬 Chat com o engenheiro (aba 🤖)** — pergunte "onde prospectar?", "como usar a bateia",
  "profundidade", "é legal aqui?" e receba resposta com contexto real: sua posição, situação
  legal da zona, alvo escolhido e o último estudo de potencial do mapa. Usa a IA configurada; sem
  IA, responde offline com orientação honesta.
- **🖥️ Ponte IA via OpenCode (Big Pickle ou melhor)** — `tools/bridge` é um servidor local no seu
  PC que o app chama pela rede Wi-Fi e encaminha foto + prompt para o melhor modelo de visão do
  seu **OpenCode** (ou modo OpenAI/Gemini com chave). Veja `tools/bridge/README.md`.
- **🔊 Voz em português** — instruções faladas na entrada de zona bloqueada e leitura da
  recomendação.
- **📜 Histórico offline** — análises salvas em SQLite local, com foto/vídeo, referências web,
  fonte do sinal e reprodução por voz.
- **⚙️ Ajustes** — nome do operador, voz on/off, URL/chave da API de visão, registro de
  **PLG por zona** e gerenciador de mídia (tamanho + limpeza).

## 🗂️ Estrutura

```
src/
  app/          # rotas Expo Router (index=casa 3D/2D/radar, chat, camera, history, settings)
  components/   # terrain-map-3d (WebView: Google Earth 3D / MapLibre), satellite-map, radar-map, zone-badge, tabs, themed-*
  data/         # zones.ts (polígonos de demonstração)
  hooks/        # use-geolocation (GPS + status legal da zona)
  services/     # geo (haversine/polygon), storage (SQLite KV),
                # geolocation, mineralEngineer (IA+offline), aiChat, terrain-map-html
                # (motor 3D reserva + potencial mineral), google-earth-html (motor
                # Google Photorealistic 3D Tiles via Cesium), sessionStore, voice, webResearch
  types/        # análise, zonas, permissões, configurações, alvo mineral, potencial
tools/
  bridge/       # ponte local (PC): conecta o app ao OpenCode/qualquer IA de visão
```

## 🧹 Qualidade

```bash
npm run lint       # ESLint
npx tsc --noEmit   # checagem de tipos
npx expo-doctor    # compatibilidade de dependências
```

## 🔮 Próximas fases (visão)

- Shapefiles reais (FUNAI/ICMBio/ANM SIGMINE/CPRM/USGS) + atualização por período.
- Bandas reais de alteração mineral via Sentinel-2/Landsat (óxidos/argilas) para **validar as
  áreas azuis** de potencial — hoje o azul vem de modelo de terreno (elevação/declividade).
- Histórico geológico e indicadores de ouro por região.
- Comandos de voz (ditar observações).
- Relatório PLG (geração de documento).
- Integração com laboratórios parceiros (teor de amostras).

---

Criado com [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).