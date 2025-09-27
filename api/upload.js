export const config = {
  api: {
    bodyParser: false, // Deaktiviert Vercels Standard-Parser
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // Body manuell einlesen
    let body = "";
    for await (const chunk of req) {
      body += chunk;
    }

    // JSON parsen
    const data = JSON.parse(body || "{}");

    if (!data.filename || !data.fileContent) {
      return res.status(400).json({
        error: "Missing data",
        received: data
      });
    }

    // Hier wäre später Dropbox Upload
    return res.status(200).json({
      ok: true,
      debug: "Body empfangen",
      received: data
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}
