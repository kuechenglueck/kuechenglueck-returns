// api/upload.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    // ---- Schritt 1: Neuen Access Token über Refresh Token holen ----
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
      console.error("Error fetching access token:", tokenData);
      return res.status(500).json({ error: "Failed to refresh access token", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // ---- Schritt 2: Datei(en) zu Dropbox hochladen ----
    const uploadedFiles = [];

    for (const file of files) {
      const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({
            path: `/${file.name}`,
            mode: "add",
            autorename: true,
            mute: false,
          }),
        },
        body: Buffer.from(file.data, "base64"),
      });

      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok) {
        console.error("Dropbox upload failed:", uploadResult);
        return res.status(500).json({ error: "Dropbox upload failed", details: uploadResult });
      }

      // Freigabe-Link erzeugen
      const shareResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: uploadResult.path_lower,
          settings: { requested_visibility: "public" },
        }),
      });

      const shareResult = await shareResponse.json();

      if (!shareResponse.ok) {
        console.error("Dropbox share link failed:", shareResult);
        return res.status(500).json({ error: "Failed to create share link", details: shareResult });
      }

      uploadedFiles.push({ name: file.name, link: shareResult.url.replace("?dl=0", "?dl=1") });
    }

    return res.status(200).json({ success: true, files: uploadedFiles });

  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error", details: err.message });
  }
}
