# OpenPaye MCP Server

Serveur MCP (Model Context Protocol) compatible CustomGPT.ai.

## 🚀 Déploiement sur Render

1. Crée un repo GitHub
2. Push les fichiers du projet
3. Va sur https://render.com → "New Web Service"
4. Select ton repo
5. Build: `npm install`
6. Run: `node server.mjs`
7. L’URL MCP = `https://xxxxx.onrender.com/sse`

## 🔧 Endpoints

- `/sse` : flux MCP
- `/messages` : messages MCP
- `/connect` : enregistrement dossier OpenPaye + clé API
