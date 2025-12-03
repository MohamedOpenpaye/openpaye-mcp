// server.mjs
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// -----------------------------
// Stockage en RAM (à remplacer plus tard par une DB Redis ou autre)
// -----------------------------
const CLIENTS = Object.create(null);

// -----------------------------
// MCP SERVER + TOOLS
// -----------------------------
const server = new McpServer({ name: "openpaye-mcp", version: "1.0.0" });

// TOOL: Create Employee
server.registerTool(
  "create_employee",
  {
    title: "Create Employee",
    description: "Crée un salarié dans OpenPaye via les credentials stockés.",
    inputSchema: z.object({
      client_id: z.string(),
      employee: z.object({
        firstname: z.string(),
        lastname: z.string(),
        email: z.string().optional(),
        start_date: z.string().optional()
      })
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional()
    })
  },
  async ({ client_id, employee }) => {
    const creds = CLIENTS[client_id];
    if (!creds) {
      const msg = {
        ok: false,
        error: `Aucun accès trouvé pour "${client_id}". Va sur /connect pour enregistrer ta clé.`
      };
      return {
        content: [{ type: "text", text: JSON.stringify(msg) }],
        structuredContent: msg
      };
    }

    const { api_key, dossier_id } = creds;

    try {
      const url = `https://api.openpaye.co/v1/companies/${dossier_id}/employees`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api_key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(employee)
      });

      if (!r.ok) {
        const text = await r.text();
        const msg = { ok: false, error: `OpenPaye ${r.status}: ${text}` };
        return {
          content: [{ type: "text", text: JSON.stringify(msg) }],
          structuredContent: msg
        };
      }

      const data = await r.json();
      const msg = { ok: true, data };
      return {
        content: [{ type: "text", text: JSON.stringify(msg) }],
        structuredContent: msg
      };
    } catch (e) {
      const msg = { ok: false, error: String(e) };
      return {
        content: [{ type: "text", text: JSON.stringify(msg) }],
        structuredContent: msg
      };
    }
  }
);

// TOOL: Create Contract
server.registerTool(
  "create_contract",
  {
    title: "Create Contract",
    description: "Crée un contrat pour un salarié existant.",
    inputSchema: z.object({
      client_id: z.string(),
      employee_id: z.string(),
      contract: z.object({
        start_date: z.string(),
        end_date: z.string().optional(),
        position: z.string().optional()
      })
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      data: z.any().optional(),
      error: z.string().optional()
    })
  },
  async ({ client_id, employee_id, contract }) => {
    const creds = CLIENTS[client_id];
    if (!creds) {
      const msg = {
        ok: false,
        error: `Aucun accès trouvé pour "${client_id}". Va sur /connect pour enregistrer ta clé.`
      };
      return {
        content: [{ type: "text", text: JSON.stringify(msg) }],
        structuredContent: msg
      };
    }

    const { api_key, dossier_id } = creds;

    try {
      const url = `https://api.openpaye.co/v1/companies/${dossier_id}/employees/${employee_id}/contracts`;
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${api_key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(contract)
      });

      if (!r.ok) {
        const text = await r.text();
        const msg = { ok: false, error: `OpenPaye ${r.status}: ${text}` };
        return {
          content: [{ type: "text", text: JSON.stringify(msg) }],
          structuredContent: msg
        };
      }

      const data = await r.json();
      const msg = { ok: true, data };
      return {
        content: [{ type: "text", text: JSON.stringify(msg) }],
        structuredContent: msg
      };
    } catch (e) {
      const msg = { ok: false, error: String(e) };
      return {
        content: [{ type: "text", text: JSON.stringify(msg) }],
        structuredContent: msg
      };
    }
  }
);

// -----------------------------
// EXPRESS + ROUTES SSE
// -----------------------------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const transports = {};

app.get("/", (_req, res) => {
  res.send("✅ OpenPaye MCP ready");
});

// SSE Endpoint
app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    try { transport.close(); } catch {}
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

// POST messages
app.post("/messages", async (req, res) => {
  const sessionId =
    req.query.sessionId ||
    req.get("Mcp-Session-Id") ||
    req.get("x-session-id");

  const transport = transports[sessionId];
  if (!transport) return res.status(400).send("Unknown sessionId");

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// -----------------------------
// FORM /connect
// -----------------------------
app.get("/connect", (req, res) => {
  const clientId = req.query.client_id ? String(req.query.client_id) : "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connecter OpenPaye</title>

<style>
  body {
    font-family: system-ui, sans-serif;
    background: #FAFAFA;
    margin: 0;
    padding: 40px 20px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    color: #003068;
  }

  .container {
    width: 100%;
    max-width: 480px;
    background: white;
    padding: 32px;
    border-radius: 16px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.08);
    border: 1px solid #E3EAF3;
  }

  h1 {
    font-size: 26px;
    margin: 0 0 20px;
    text-align: center;
    font-weight: 700;
    color: #003068;
  }

  label {
    display: block;
    margin: 18px 0 6px;
    font-weight: 600;
    font-size: 15px;
  }

  input {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    border-radius: 10px;
    border: 1px solid #C7D3E0;
    background: white;
  }

  button {
    width: 100%;
    margin-top: 28px;
    padding: 14px;
    background: #003068;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
  }

  .note {
    text-align: center;
    font-size: 14px;
    color: #4A5566;
    margin-top: 20px;
  }
</style>

</head>
<body>

<div class="container">
  <h1>Connecter OpenPaye</h1>

  <form method="POST" action="/connect">
    <input type="hidden" name="client_id" value="${clientId}">

    <label for="dossier_id">Numéro de dossier</label>
    <input id="dossier_id" name="dossier_id" placeholder="ex: 4000" required>

    <label for="api_ident">Identifiant API</label>
    <input id="api_ident" name="api_ident" placeholder="ex: 19823" required>

    <label for="api_key">Clé API (secrète)</label>
    <input id="api_key" name="api_key" placeholder="sk_live_xxx" required>

    <button type="submit">Enregistrer</button>
  </form>

  <p class="note">
    Vos identifiants sont stockés sur le serveur sécurisé<br>
    et ne sont jamais envoyés à CustomGPT.
  </p>
</div>

</body>
</html>`);
});

app.post("/connect", (req, res) => {
  const { client_id, dossier_id, api_key } = req.body;

  CLIENTS[client_id] = { dossier_id, api_key };

  res.send(`✔️ Connecté pour ${client_id}`);
});

// -----------------------------
// START SERVER
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 MCP server running on port", PORT);
});
