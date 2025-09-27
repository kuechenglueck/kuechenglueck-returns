// /api/upload.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    // --- Step 1: Neuen Access Token mit Refresh Token holen ---
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
      return res.status(500).json({ error: "Failed to refresh access token", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // --- Step 2: Datei(en) zu Dropbox hochladen ---
    let uploadedFiles = [];

    for (const file of files) {
      const uploadResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: `/${file.name}`,
            mode: "add",
            autorename: true,
            mute: false,
          }),
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(file.data, "base64"),
      });

      const uploadData = await uploadResponse.json();

      if (uploadResponse.ok) {
        // --- Step 3: Freigabe-Link erstellen ---
        const linkResponse = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ path: uploadData.path_lower, settings: { requested_visibility: "public" } }),
        });

        const linkData = await linkResponse.json();

        if (linkResponse.ok) {
          uploadedFiles.push({ name: file.name, link: linkData.url });
        } else {
          uploadedFiles.push({ name: file.name, error: linkData });
        }
      } else {
        uploadedFiles.push({ name: file.name, error: uploadData });
      }
    }

    return res.status(200).json({ success: true, files: uploadedFiles });
  } catch (error) {
    return res.status(500).json({ error: "Dropbox upload failed", details: error.message });
  }
}
