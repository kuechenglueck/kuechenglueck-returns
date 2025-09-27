import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // maximale Größe pro Request
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // === 1. Neuen Access Token mit dem Refresh Token anfordern ===
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
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(500).json({ error: "Token fetch failed", details: tokenData });
    }

    // === 2. Dateien aus dem Request holen ===
    const { files } = req.body; // erwartet [{name, type, data(base64)}]

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    if (files.length > 3) {
      return res.status(400).json({ error: "Max 3 files allowed" });
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/heic"];
    const uploadedFiles = [];

    for (let file of files) {
      const { name, type, data } = file;

      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: `File type not allowed: ${type}` });
      }

      const buffer = Buffer.from(data, "base64");

      // === 3. Datei zu Dropbox hochladen ===
      const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: `/${Date.now()}-${name}`,
            mode: "add",
            autorename: true,
            mute: false,
          }),
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        return res.status(500).json({ error: "Dropbox upload failed", details: err });
      }

      const uploadedMeta = await uploadRes.json();

      // === 4. Freigabelink erzeugen ===
      const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: uploadedMeta.path_lower }),
      });

      const shareData = await shareRes.json();

      if (!shareData.url) {
        return res.status(500).json({ error: "Failed to create share link", details: shareData });
      }

      const directLink = shareData.url.replace("?dl=0", "?raw=1");
      uploadedFiles.push({ name, link: directLink });
    }

    // === 5. Erfolgsantwort zurück an Shopify-Formular ===
    return res.status(200).json({ success: true, files: uploadedFiles });

  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
}
