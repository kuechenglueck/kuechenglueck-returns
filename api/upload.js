import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // maximale Dateigröße
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { files } = req.body; // erwartet ein Array [{name, type, data(base64)}]

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    if (files.length > 3) {
      return res.status(400).json({ error: "Max 3 files allowed" });
    }

    const uploadedFiles = [];

    for (let file of files) {
      const { name, type, data } = file;

      // Nur erlaubte Dateitypen
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
      if (!allowedTypes.includes(type)) {
        return res.status(400).json({ error: `File type not allowed: ${type}` });
      }

      // Upload zu Dropbox
      const buffer = Buffer.from(data, "base64");

      const dropboxUpload = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.DROPBOX_TOKEN}`,
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

      if (!dropboxUpload.ok) {
        const error = await dropboxUpload.text();
        return res.status(500).json({ error: "Dropbox upload failed", details: error });
      }

      const uploadedMeta = await dropboxUpload.json();

      // Direktlink erzeugen
      const shareRes = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.DROPBOX_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: uploadedMeta.path_lower }),
      });

      const shareData = await shareRes.json();

      // Direktlink zu einer Bilddatei (dl=1 → direkte Datei)
      const directLink = shareData.url.replace("?dl=0", "?raw=1");

      uploadedFiles.push({ name, link: directLink });
    }

    return res.status(200).json({ success: true, files: uploadedFiles });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
