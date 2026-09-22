# KravenOps 🦾

Aplicativo mobile **React Native + Expo** (TypeScript) — base pronta para evoluir
para um app comercial completo.

> Stack: Expo SDK 57 · React 19 · React Native 0.86 · TypeScript · Expo Router

## 🚀 Rodando o projeto

```bash
npm install        # instala dependências
npx expo start     # abre o dev server (QR code no terminal)
```

Opções do dev server:

- **Expo Go** — escaneie o QR code com seu celular
- **Android** — `npx expo start --android` (emulador)
- **iOS** — `npx expo start --ios` (simulador)
- **Web** — `npx expo start --web`

## 📁 Estrutura

- `app/` ou `src/app/` — rotas via **Expo Router** (file-based routing)
- `src/` — componentes, telas e lógica do app
- `assets/` — imagens, fontes e ícones

## 🧹 Qualidade

```bash
npm run lint       # ESLint
npx tsc --noEmit   # checagem de tipos
```

## 📦 Setup inicial

```bash
npm run reset-project   # limpa o código de exemplo e cria um app/ em branco
```

---

Criado com [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).