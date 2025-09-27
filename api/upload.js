export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log("STEP 1: Environment Vars", {
      key: process.env.DROPBOX_APP_KEY ? "OK" : "MISSING",
      secret: process.env.DROPBOX_APP_SECRET ? "OK" : "MISSING",
      refresh: process.env.DROPBOX_REFRESH_TOKEN ? "OK" : "MISSING",
    });

    // === 1. Refresh Token gegen Access Token tauschen ===
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
    console.log("STEP 2: Dropbox Token Response", tokenData);

    if (!tokenData.access_token) {
      return res.status(500).json({
        error: "Token exchange failed",
        details: tokenData,
      });
    }

    const accessToken = tokenData.access_token;

    // === 2. Datei-Upload zu Dropbox ===
    const { filename, file } = req.body;

    if (!file) {
      return res.status(400).json({ error: "No file provided" });
    }

    console.log("STEP 3: Preparing upload", { filename });

    const dropboxResponse = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          path: "/" + filename,
          mode: "add",
          autorename: true,
          mute: false,
          strict_conflict: false,
        }),
      },
      body: Buffer.from(file, "base64"),
    });

    const dropboxData = await dropboxResponse.json();
    console.log("STEP 4: Dropbox Upload Response", dropboxData);

    if (!dropboxResponse.ok) {
      return res.status(500).json({
        error: "Dropbox upload failed",
        details: dropboxData,
      });
    }

    return res.status(200).json({ success: true, data: dropboxData });

  } catch (err) {
    console.error("FATAL ERROR:", err);
    return res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
}
