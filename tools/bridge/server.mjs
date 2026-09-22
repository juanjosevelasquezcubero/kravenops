#!/usr/bin/env node
/**
 * Ponte KravenOps ↔ OpenCode (ou qualquer modelo de visão compatível).
 *
 * O app do celular envia { prompt, imageBase64 } para http://<IP-do-PC>:4600/analyze
 * (campo "URL da IA" nos Ajustes). Este servidor encaminha para o modelo escolhido
 * e devolve o contrato JSON do Engenheiro de Minérios.
 *
 * Modos (variável de ambiente BRIDGE_PROVIDER):
 * - opencode (padrão): executa `opencode run` na máquina — usa Big Pickle ou o
 *   melhor modelo de visão configurado no seu OpenCode.
 * - openai   : qualquer endpoint compatível com OpenAI (incl. Gemini via
 *   https://generativelanguage.googleapis.com/v1beta/openai).
 *
 * Como rodar:
 *   cd tools/bridge
 *   BRIDGE_MODEL=<modelo-de-visao> node server.mjs
 * (veja README.md da pasta para instruções completas)
 */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.BRIDGE_PORT || 4600);
const HOST = process.env.BRIDGE_HOST || '0.0.0.0';
const PROVIDER = process.env.BRIDGE_PROVIDER || 'opencode';
const MODEL = process.env.BRIDGE_MODEL || '';
const MAX_BODY_BYTES = 60 * 1024 * 1024; // 60 MB (foto + prompt)

const CONTRACT = JSON.stringify({
  indicadores: ['<indicador 1>', '<indicador 2>'],
  recomendacao: '<roteiro prático em português simples>',
  direcao: '<N/NE/L/SE/S/SO/O/NO ou sem preferência>',
  profundidade: '<sugestão de teste inicial>',
  confianca: 0.0,
});

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function extractJson(text) {
  const t = String(text).replace(/```json|```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalize(raw) {
  const obj = extractJson(raw);
  if (obj && Array.isArray(obj.indicadores)) {
    return {
      indicadores: obj.indicadores.map(String),
      recomendacao: String(obj.recomendacao || 'Análise concluída sem detalhes.'),
      direcao: obj.direcao == null ? null : String(obj.direcao),
      profundidade: obj.profundidade == null ? null : String(obj.profundidade),
      confianca: Number.isFinite(Number(obj.confianca)) ? Number(obj.confianca) : 0.5,
    };
  }
  // O modelo não devolveu JSON estruturado — entrega o texto como recomendação.
  const clean = String(raw || '').trim();
  return {
    indicadores: [],
    recomendacao: clean || 'Sem resposta do modelo.',
    direcao: null,
    profundidade: null,
    confianca: 0.3,
  };
}

function runOpencode(prompt, imageBase64) {
  return new Promise((resolve, reject) => {
    const args = ['run', '--standalone', '--format', 'json'];
    if (MODEL) args.push('--model', MODEL);

    let imagePath = null;
    const run = () => {
      const fullPrompt =
        `${prompt}\n\nResponda APENAS um objeto JSON válido, sem markdown, neste contrato: ${CONTRACT}`;
      if (imagePath) args.push('--file', imagePath);
      args.push(fullPrompt);

      log('opencode', args.join(' '));
      const child = spawn('opencode', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timeout = setTimeout(() => child.kill(), 180000);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('close', async (code) => {
        clearTimeout(timeout);
        if (imagePath) unlink(imagePath).catch(() => {});
        if (code !== 0) {
          reject(new Error(`opencode saiu com código ${code}: ${err.slice(0, 600)}`));
          return;
        }
        // --format json emite NDJSON; a última mensagem assistant é a resposta.
        const lines = out.split('\n').filter(Boolean);
        let lastAssistant = '';
        for (const line of lines) {
          try {
            const evt = JSON.parse(line);
            if (evt && evt.type === 'assistant' && typeof evt.text === 'string') {
              lastAssistant = evt.text;
            } else if (evt && evt.message && typeof evt.message === 'string') {
              lastAssistant = evt.message;
            }
          } catch {
            // linha não-JSON: ignora
          }
        }
        resolve(lastAssistant || out);
      });
      child.on('error', (e) => {
        clearTimeout(timeout);
        if (imagePath) unlink(imagePath).catch(() => {});
        reject(new Error(`Não foi possível iniciar o OpenCode CLI: ${e.message}. Instale com: npm install --global @opencode/cli`));
      });
    };

    if (imageBase64) {
      imagePath = join(tmpdir(), `kravenops-shot-${Date.now()}.jpg`);
      const buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      writeFile(imagePath, buf)
        .then(run)
        .catch((e) => reject(new Error(`Erro ao gravar imagem temporária: ${e.message}`)));
    } else {
      run();
    }
  });
}

async function runOpenAI(prompt, imageBase64) {
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || '';
  const model = process.env.OPENAI_MODEL || MODEL || 'gpt-4o-mini';
  if (!apiKey) throw new Error('OPENAI_API_KEY (ou GEMINI_API_KEY) não configurada no modo openai.');

  const system =
    'Você é o "Engenheiro de Minérios" do KravenOps, geólogo sênior. Responda APENAS um objeto JSON válido, sem markdown, no contrato: ' +
    CONTRACT;
  const content = [{ type: 'text', text: prompt }];
  if (imageBase64) {
    const mime = imageBase64.startsWith('data:') ? imageBase64.split(',')[0].replace('data:', '').split(';')[0] : 'image/jpeg';
    const data = imageBase64.startsWith('data:') ? imageBase64.split(',')[1] : imageBase64;
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } });
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function handleAnalyze(reqBody) {
  const { prompt, imageBase64 } = reqBody;
  if (!prompt) throw new Error('Campo "prompt" é obrigatório.');

  let raw;
  if (PROVIDER === 'openai') {
    raw = await runOpenAI(prompt, imageBase64);
  } else {
    raw = await runOpencode(prompt, imageBase64);
  }
  return normalize(raw);
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const send = (code, payload) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(payload));
  };

  if (req.method === 'OPTIONS') {
    send(200, {});
    return;
  }

  if (req.method === 'GET' && url === '/health') {
    const info = { ok: true, provider: PROVIDER, model: MODEL || '(padrão do OpenCode)' };
    if (PROVIDER === 'openai') info.model = process.env.OPENAI_MODEL || MODEL || 'gpt-4o-mini';
    log('health', info);
    send(200, info);
    return;
  }

  if (req.method === 'POST' && url === '/analyze') {
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) aborted = true;
      else chunks.push(c);
    });
    req.on('end', async () => {
      if (aborted) {
        send(413, { error: 'Corpo muito grande (máx. 60 MB).' });
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        log('analyze in', { promptLen: (body.prompt || '').length, imageBytes: ((body.imageBase64 || '').length * 3) / 4 });
        const result = await handleAnalyze(body);
        log('analyze ok', { recomendacao: (result.recomendacao || '').slice(0, 60) });
        send(200, result);
      } catch (e) {
        log('analyze error', e.message);
        send(502, { error: e.message });
      }
    });
    return;
  }

  send(404, { error: 'Rota não encontrada. Use POST /analyze ou GET /health.' });
});

server.listen(PORT, HOST, () => {
  log(`🛰️  Bridge KravenOps rodando em http://${HOST}:${PORT} (provider=${PROVIDER}, model=${MODEL || 'padrão'})`);
  log('No celular (mesma rede Wi-Fi), coloque em Ajustes → URL da IA:');
  log(`  http://<IP-deste-PC>:${PORT}/analyze`);
  log('Se não souber o IP do PC, rode: ipconfig | findstr IPv4');
});