// Serverless Function (Vercel) – nimmt FormData entgegen, lädt zu Dropbox, gibt Shared-Link zurück.
// Erlaubte Typen: JPG/JPEG/PNG/HEIC, max. 10 MB

const Busboy = require("busboy");

// ---- Helpers --------------------------------------------------------------

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
    });

    const fields = {};
    let fileBuffer = Buffer.alloc(0);
    let fileInfo = null;
    let fileTooLarge = false;

    bb.on("file", (name, file, info) => {
      const { filename, mimeType } = info || {};
      fileInfo = { filename: filename || "upload.bin", mimeType: mimeType || "", size: 0 };
      file.on("data", (data) => {
        fileInfo.size += data.length;
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
      file.on("limit", () => {
        fileTooLarge = true;
        file.resume();
      });
    });

    bb.on("field", (name, val) => { fields[name] = val; });
    bb.on("error", reject);
    bb.on("finish", () => {
      if (fileTooLarge) return reject(new Error("FILE_TOO_LARGE"));
      resolve({ fields, file: fileInfo ? { ...fileInfo, buffer: fileBuffer } : null });
    });

    req.pipe(bb);
  });
}

async function getAccessToken() {
  const resp = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization":
        "Basic " + Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`TOKEN_ERROR ${resp.status} ${JSON.stringify(data)}`);
  return data.access_token;
}

async function uploadToDropbox(token, buffer, path) {
  const resp = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ path, mode: "add", autorename: true, mute: false, strict_conflict: false }),
      "Content-Type": "application/octet-stream",
    },
    body: buffer,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`UPLOAD_ERROR ${resp.status} ${JSON.stringify(data)}`);
  return data; // contains id, path_display, path_lower, ...
}

async function getSharedLink(token, pathLower) {
  // Versuch: Link neu anlegen
  let resp = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: pathLower, settings: { requested_visibility: "public" } }),
  });
  let data = await resp.json();

  if (resp.ok && data?.url) return data.url.replace("?dl=0", "?dl=1");

  // Fallback: falls Link bereits existiert
  if (data?.error?.[".tag"] === "shared_link_already_exists") {
    const list = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathLower, direct_only: true }),
    });
    const listData = await list.json();
    const url = listData?.links?.[0]?.url;
    if (url) return url.replace("?dl=0", "?dl=1");
  }

  throw new Error(`LINK_ERROR ${JSON.stringify(data)}`);
}

// ---- Handler --------------------------------------------------------------

module.exports = async (req, res) => {
  // CORS für Tests / spätere Shopify-Integration
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    // 1) Multipart einlesen
    const { fields, file } = await parseMultipart(req);
    if (!file) throw new Error("NO_FILE");
    const allowedExt = new Set(["jpg", "jpeg", "png", "heic"]);
    const allowedMime = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

    const orig = file.filename || "upload.jpg";
    const ext = (orig.split(".").pop() || "").toLowerCase();
    if (!allowedExt.has(ext)) throw new Error("BAD_EXT");
    if (!allowedMime.has(file.mimeType)) throw new Error("BAD_MIME");
    if (file.size > 10 * 1024 * 1024) throw new Error("FILE_TOO_LARGE");

    const safeBase = (fields.order_number || "retour").replace(/[^\w\-]+/g, "_").slice(0, 50);
    const folder = process.env.DROPBOX_FOLDER || "/retouren";
    const dropboxPath = `${folder}/${safeBase}_${Date.now()}.${ext}`;

    // 2) Token holen
    const token = await getAccessToken();

    // 3) Upload
    const meta = await uploadToDropbox(token, file.buffer, dropboxPath);

    // 4) Shared-Link
    const link = await getSharedLink(token, meta.path_lower);

    // 5) Antwort
    res.status(200).json({
      ok: true,
      link,                 // direkt klickbarer Link (?dl=1)
      path: meta.path_display,
      id: meta.id,
      name: orig,
      size: file.size,
      mime: file.mimeType,
    });
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err);
    let code = 400;
    if (msg.includes("TOKEN_ERROR")) code = 401;
    else if (msg.includes("UPLOAD_ERROR") || msg.includes("LINK_ERROR")) code = 502;
    res.status(code).json({ ok: false, error: msg });
  }
};
