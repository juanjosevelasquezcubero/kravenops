# 🛰️ Ponte KravenOps ↔ OpenCode (IA no celular)

Este servidor local conecta o **app do celular** ao melhor modelo que você tiver disponível no
**OpenCode** do seu PC (ex.: o modelo *Big Pickle* ou qualquer modelo de visão mais forte — Claude,
GPT, Gemini…). O app envia a foto + o prompt do Engenheiro de Minérios e recebe o parecer JSON.

```
Celular (Expo Go)  ──HTTP Wi-Fi──▶  Ponte (este PC)  ──▶  opencode run --model <melhor modelo>
```

## 1. Instale o OpenCode CLI (se ainda não tiver)

```powershell
npm install --global @opencode/cli
```

Confirme que `opencode` abriu/está logado no fornecedor desejado (`opencode auth list`).

## 2. Escolha o modelo

```powershell
opencode models
```

Pegue o ID de **um modelo com entrada de imagens (visão)**. Exemplos comuns:
`anthropic/claude-sonnet-4-5`, `openai/gpt-4o`… Se o provider `opencode` (Big Pickle) estiver
configurado na sua instalação, use o ID que aparecer na lista. **Modelo sem suporte a imagem
rejeita a foto** — escolha um de visão.

## 3. Rode a ponte

```powershell
cd kravenops\tools\bridge
$env:BRIDGE_MODEL = "anthropic/claude-sonnet-4-5"   # ou "opencode/big-pickle", ou o melhor que tiver
node server.mjs
```

- Porta padrão: `4600` (mude com `$env:BRIDGE_PORT`)
- O servidor escuta em todas as interfaces (`0.0.0.0`) para o celular alcançar

## 4. Descubra o IP do PC e ligue no app

```powershell
ipconfig | findstr IPv4
```

No app → **Ajustes → Inteligência (IA)** → preencha:
- **URL da IA:** `http://<IP-do-PC>:4600/analyze`
- **Chave da IA:** deixe em branco (o OpenCode usa as credenciais dele)

Celular e PC precisam estar na **mesma rede Wi-Fi**.

## Alternativa sem PC: Gemini / OpenAI (chave API direta)

Se preferir não rodar nada no PC, use o modo OpenAI-compatível:

```powershell
$env:BRIDGE_PROVIDER = "openai"
$env:GEMINI_API_KEY = "SUA_CHAVE_FREE_DO_GEMINI"
$env:OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
$env:OPENAI_MODEL = "gemini-2.0-flash"
node server.mjs
```

E configure o app com a mesma URL `http://<IP>:4600/analyze`. O Gemini tem camada grátis e boa
visão em português.

## API da ponte (contrato)

`POST /analyze` — corpo:
```json
{
  "prompt": "<prompt do Engenheiro de Minérios>",
  "imageBase64": "<foto em base64 (opcional)>"
}
```
Resposta:
```json
{
  "indicadores": ["..."],
  "recomendacao": "roteiro em português",
  "direcao": "NE",
  "profundidade": "Poço de 1,5–3 m",
  "confianca": 0.85
}
```

`GET /health` — status + modelo em uso.

## Solução de problemas

- **"opencode CLI não encontrado"** → instale o passo 1 e reinicie o PowerShell.
- **Imagem rejeitada pelo modelo** → troque `BRIDGE_MODEL` por um modelo de visão.
- **Celular não conecta** → mesma rede Wi-Fi; libere a porta no firewall do Windows
  (`New-NetFirewallRule -DisplayName kravenops-bridge -Direction Inbound -Protocol TCP -LocalPort 4600 -Action Allow`).
- **A resposta vem como texto solto** → o modelo não produziu JSON; a ponte entrega o texto como
  recomendação (confiança 0.3).