import express from "express";
import multer from "multer";
import fetch from "node-fetch";

const app = express();
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB Limit

app.post("/api/upload", upload.array("photos", 3), async (req, res) => {
  try {
    const token = process.env.DROPBOX_TOKEN; // Token kommt als ENV Variable
    if (!token) return res.status(500).send("Dropbox Token fehlt");

    const uploadedFiles = [];

    for (let file of req.files) {
      const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Dropbox-API-Arg": JSON.stringify({
            path: `/returns/${Date.now()}-${file.originalname}`,
            mode: "add",
            autorename: true,
            mute: false
          }),
          "Content-Type": "application/octet-stream"
        },
        body: file.buffer
      });

      if (!response.ok) {
        throw new Error(`Dropbox Fehler: ${await response.text()}`);
      }

      const data = await response.json();
      uploadedFiles.push(`https://www.dropbox.com/home/returns?preview=${data.name}`);
    }

    res.json({ links: uploadedFiles });
  } catch (err) {
    console.error(err);
    res.status(500).send("Fehler beim Hochladen");
  }
});

export default app;
