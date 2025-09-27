// api/upload.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body;

    if (!files || !files.length) {
      return res.status(400).json({ error: "No files provided" });
    }

    // ---- 1. Frischen Access Token mit Refresh Token holen ----
    const tokenResponse = await fetch("https://api.dropbox.com/oauth2/token", {
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
      return res
        .status(500)
        .json({ error: "Failed to refresh access token", details: tokenData });
    }

    const accessToken = tokenData.access_token;

    // ---- 2. Dateien zu Dropbox hochladen ----
    const uploadedFiles = [];

    for (const file of files) {
      const fileBuffer = Buffer.from(file.data, "base64");

      const uploadResponse = await fetch(
        "https://content.dropboxapi.com/2/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Dropbox-API-Arg": JSON.stringify({
              path: `/${file.name}`,
              mode: "add",
              autorename: true,
              mute: false,
              strict_conflict: false,
            }),
            "Content-Type": "application/octet-stream",
          },
          body: fileBuffer,
        }
      );

      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok) {
        console.error("Dropbox upload error:", uploadData);
        return res
          .status(500)
          .json({ error: "Failed to upload file", details: uploadData });
      }

      // ---- 3. Einen freigegebenen Link für die Datei erstellen ----
      const linkResponse = await fetch(
        "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path: uploadData.path_lower,
            settings: { requested_visibility: "public" },
          }),
        }
      );

      const linkData = await linkResponse.json();

      if (!linkResponse.ok) {
        console.error("Dropbox link error:", linkData);
        return res
          .status(500)
          .json({ error: "Failed to create shared link", details: linkData });
      }

      // Public Link etwas schöner machen (dl=1 für Direktlink)
      const publicLink = linkData.url.replace("?dl=0", "?raw=1");

      uploadedFiles.push({
        name: file.name,
        link: publicLink,
      });
    }

    // ---- 4. Antwort zurückgeben ----
    return res.status(200).json({ success: true, files: uploadedFiles });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res.status(500).json({ error: "Unexpected error", details: error });
  }
}
