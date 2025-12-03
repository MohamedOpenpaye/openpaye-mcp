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
  const client_id = req.query.client_id || "";

  res.setHeader("Content-Type", "text/html");
  res.end(`
<!doctype html>
<html>
<body>
  <h2>Connecter OpenPaye</h2>
  <form action="/connect" method="POST">
    <label>Client ID</label>
    <input name="client_id" value="${client_id}" />
    <br><br>
    <label>Dossier OpenPaye</label>
    <input name="dossier_id" />
    <br><br>
    <label>Clé API</label>
    <input name="api_key" />
    <br><br>
    <button type="submit">Enregistrer</button>
  </form>
</body>
</html>
  `);
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
