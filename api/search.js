
async function getBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-key");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const TOKEN = process.env.LEAKOSINT_TOKEN;
  const ACCESS_KEY = process.env.ACCESS_KEY;

  if (!TOKEN) {
    return res.status(500).json({
      error: "LEAKOSINT_TOKEN is not set in Vercel Environment Variables"
    });
  }

  let body = {};

  if (req.method === "GET") {
    body = req.query || {};
  } else if (req.method === "POST") {
    body = await getBody(req);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const providedKey = req.headers["x-access-key"] || body.key;

  if (ACCESS_KEY && providedKey !== ACCESS_KEY) {
    return res.status(401).json({
      error: "Unauthorized: wrong or missing access key"
    });
  }

  const request = body.request;

  if (!request) {
    return res.status(400).json({
      error: "Missing request parameter"
    });
  }

  const limit = Math.min(
    10000,
    Math.max(100, parseInt(body.limit, 10) || 100)
  );

  const lang = body.lang || "en";
  const type = body.type || "json";
  const bot_name = body.bot_name;

  const payload = {
    token: TOKEN,
    request,
    limit,
    lang,
    type
  };

  if (bot_name) {
    payload.bot_name = bot_name;
  }

  try {
    const apiRes = await fetch("https://leakosintapi.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const contentType = apiRes.headers.get("content-type") || "";

    if (type === "json" || contentType.includes("application/json")) {
      const text = await apiRes.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      return res.status(apiRes.status).json(data);
    }

    const text = await apiRes.text();
    res.setHeader("Content-Type", contentType || "text/plain; charset=utf-8");
    return res.status(apiRes.status).send(text);
  } catch (err) {
    return res.status(500).json({
      error: "Proxy error",
      details: err.message
    });
  }
};
