import fetch from "node-fetch";

async function getAccessToken() {
  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh Dropbox token");
  }

  const data = await res.json();
  return data.access_token;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    const token = await getAccessToken(); // immer frisches Access Token holen
    const uploadedFiles = [];

    for (let file of files) {
      const { name, type, data } = file;
      const buffer = Buffer.from(data, "base64");

      // Datei hochladen
      const uploadRes = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
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
        const errorText = await uploadRes.text();
        return res.status(500).json({ error: "Upload failed", details: errorText });
      }

      const meta = await uploadRes.json();

      // Freigabelink erzeugen
      const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: meta.path_lower }),
      });

      const shareData = await shareRes.json();
      const directLink = shareData.url ? shareData.url.replace("?dl=0", "?raw=1") : null;

      uploadedFiles.push({ name, link: directLink });
    }

    return res.status(200).json({ success: true, files: uploadedFiles });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
