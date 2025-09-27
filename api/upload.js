// /api/upload.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // === 1. Mit Refresh Token neuen Access Token holen ===
    const tokenRes = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("Kein Access Token erhalten: " + JSON.stringify(tokenData));
    }

    const accessToken = tokenData.access_token;

    // === 2. Dateien aus dem Request verarbeiten ===
    const { files } = req.body;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    let uploaded = [];

    for (const file of files) {
      const buffer = Buffer.from(file.data, "base64");

      const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: `/${file.name}`,
            mode: "add",
            autorename: true,
            mute: false,
            strict_conflict: false,
          }),
          "Content-Type": "application/octet-stream",
        },
        body: buffer,
      });

      const uploadData = await uploadRes.json();

      if (uploadData.error_summary) {
        throw new Error("Dropbox upload failed: " + JSON.stringify(uploadData));
      }

      // === 3. Share-Link generieren ===
      const linkRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: uploadData.path_lower }),
      });

      const linkData = await linkRes.json();

      uploaded.push({
        name: file.name,
        link: linkData.url ? linkData.url.replace("?dl=0", "?dl=1") : null,
      });
    }

    return res.status(200).json({ success: true, files: uploaded });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Serverfehler", details: err.message });
  }
}
