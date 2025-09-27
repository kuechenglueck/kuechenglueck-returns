import fetch from "node-fetch";

export default async function handler(req, res) {
  // ✅ CORS erlauben
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { filename, fileContent } = req.body;
    if (!filename || !fileContent) {
      return res.status(400).json({ error: "Filename and fileContent required" });
    }

    // Hole neuen Access Token über Refresh Token
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return res.status(500).json({ error: "Token refresh failed", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // Datei zu Dropbox hochladen
    const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: `/${filename}`,
          mode: "add",
          autorename: true,
          mute: false,
        }),
        "Content-Type": "application/octet-stream",
      },
      body: Buffer.from(fileContent, "base64"),
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      return res.status(500).json({ error: "Dropbox upload failed", details: errorText });
    }

    const uploadedFile = await uploadResponse.json();
    return res.status(200).json({ success: true, file: uploadedFile });
  } catch (err) {
    return res.status(500).json({ error: "Unexpected error", details: err.message });
  }
}
