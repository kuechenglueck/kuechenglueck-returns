// api/upload.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // === Schritt 1: Neues Access Token mit Refresh Token holen ===
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

    if (!tokenResponse.ok) {
      console.error("Token Error:", tokenData);
      return res.status(500).json({ error: "Failed to refresh access token", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // === Schritt 2: Datei aus Request lesen ===
    const { filename, fileContent } = req.body;

    if (!filename || !fileContent) {
      return res.status(400).json({ error: "Missing filename or fileContent" });
    }

    // === Schritt 3: Datei bei Dropbox hochladen ===
    const dropboxResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
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

    const dropboxData = await dropboxResponse.json();

    if (!dropboxResponse.ok) {
      console.error("Dropbox Upload Error:", dropboxData);
      return res.status(500).json({ error: "Dropbox upload failed", details: dropboxData });
    }

    // === Schritt 4: Link zum Download erstellen ===
    const linkResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: dropboxData.path_lower,
        settings: { requested_visibility: "public" },
      }),
    });

    const linkData = await linkResponse.json();

    if (!linkResponse.ok) {
      console.error("Dropbox Link Error:", linkData);
      return res.status(500).json({ error: "Dropbox link creation failed", details: linkData });
    }

    return res.status(200).json({
      message: "Upload successful",
      link: linkData.url,
    });

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: "Unexpected server error", details: error.message });
  }
}
