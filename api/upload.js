import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body;
    if (!files || !files.length) {
      return res.status(400).json({ error: "No files provided" });
    }

    // Schritt 1: Access Token mit Refresh Token anfordern
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return res.status(401).json({ error: "Token request failed", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // Schritt 2: Datei in Dropbox hochladen
    const file = files[0]; // nur 1 Datei erlaubt
    const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: "/" + file.name,
          mode: "add",
          autorename: true,
          mute: false
        })
      },
      body: Buffer.from(file.data, "base64")
    });

    const uploadResult = await uploadResponse.json();

    if (uploadResult.error) {
      return res.status(500).json({ error: "Dropbox upload failed", details: uploadResult });
    }

    // Schritt 3: Share-Link erstellen
    const linkResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: uploadResult.path_lower,
        settings: { requested_visibility: "public" }
      })
    });

    const linkResult = await linkResponse.json();

    if (linkResult.error) {
      return res.status(500).json({ error: "Link creation failed", details: linkResult });
    }

    res.status(200).json({ success: true, link: linkResult.url });
  } catch (err) {
    res.status(500).json({ error: "Server error", details: err.message });
  }
}
