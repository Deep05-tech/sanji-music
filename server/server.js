const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-this-secret-before-hosting-sanji";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

app.use(cors());
app.use(express.json());

const searchCache = new Map();
const SEARCH_CACHE_TTL = 5 * 60 * 1000;

function getCachedSearch(query) {
  const key = query.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > SEARCH_CACHE_TTL) { searchCache.delete(key); return null; }
  return entry.data;
}

function setCachedSearch(query, data) {
  const key = query.toLowerCase().trim();
  searchCache.set(key, { data, ts: Date.now() });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, originalHash] = String(stored || "").split(":");
  if (!salt || !originalHash) return false;
  const attemptedHash = hashPassword(password, salt).split(":")[1];
  if (originalHash.length !== attemptedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(attemptedHash, "hex"));
}

function signToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    email: user.email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const session = verifyToken(token);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  req.user = session;
  next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "sanji", backend: db.getBackend(), time: new Date().toISOString() });
});

app.post("/auth/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 6) {
      return res.status(400).json({ error: "Name, valid email, and 6+ character password are required" });
    }

    if (await db.emailExists(email)) {
      return res.status(409).json({ error: "Account already exists" });
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    await db.createUser(user);
    await db.initLibrary(user.id);

    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("[REGISTER ERROR]", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const user = await db.findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account not found" });
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error("[AUTH/ME ERROR]", err);
    res.status(500).json({ error: "Failed to get account" });
  }
});

app.get("/api/library", requireAuth, async (req, res) => {
  try {
    const library = await db.getLibrary(req.user.id);
    res.json(library);
  } catch (err) {
    console.error("[LIBRARY GET ERROR]", err);
    res.status(500).json({ error: "Failed to load library" });
  }
});

app.put("/api/library", requireAuth, async (req, res) => {
  try {
    await db.setLibrary(req.user.id, {
      likedSongs: req.body.likedSongs || {},
      playlists: req.body.playlists || [],
      recentlyPlayed: req.body.recentlyPlayed || [],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[LIBRARY PUT ERROR]", err);
    res.status(500).json({ error: "Failed to save library" });
  }
});

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Missing search query parameter 'q'" });
  }

  const cached = getCachedSearch(query);
  if (cached) {
    console.log(`[SEARCH] Cache hit for: "${query}"`);
    return res.json(cached);
  }

  console.log(`[SEARCH] Searching for: "${query}"`);

  const args = [
    `ytsearch5:${query}`,
    "--dump-json",
    "--flat-playlist",
    "--no-warnings",
    "--default-search", "ytsearch",
  ];

  const ytdlp = spawn("yt-dlp", args);

  let stdout = "";
  let stderr = "";

  ytdlp.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  ytdlp.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      console.error(`[SEARCH ERROR] yt-dlp exited with code ${code}: ${stderr}`);
      return res.status(500).json({ error: "Search failed", details: stderr });
    }

    try {
      const results = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const data = JSON.parse(line);
          return {
            title: data.title || "Unknown Title",
            videoId: data.id || data.url,
            thumbnail:
              data.thumbnails && data.thumbnails.length > 0
                ? data.thumbnails[data.thumbnails.length - 1].url
                : `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
            duration: data.duration
              ? formatDuration(data.duration)
              : "Unknown",
            durationSeconds: data.duration || 0,
            channel: data.channel || data.uploader || "Unknown Artist",
          };
        });

      console.log(`[SEARCH] Found ${results.length} results`);
      const payload = { results };
      setCachedSearch(query, payload);
      res.json(payload);
    } catch (err) {
      console.error(`[SEARCH PARSE ERROR] ${err.message}`);
      res.status(500).json({ error: "Failed to parse search results" });
    }
  });

  ytdlp.on("error", (err) => {
    console.error(`[SEARCH SPAWN ERROR] ${err.message}`);
    res.status(500).json({ error: "Failed to run yt-dlp. Is it installed?" });
  });
});

app.get("/stream/:videoId", (req, res) => {
  const { videoId } = req.params;
  console.log(`[STREAM] Resolving direct URL for: ${videoId}`);

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const ytdlp = spawn("yt-dlp", [
    url,
    "-f", "bestaudio",
    "--get-url",
    "--no-warnings",
    "--no-playlist",
  ]);

  let output = "";
  ytdlp.stdout.on("data", (data) => { output += data.toString(); });
  let errOutput = "";
  ytdlp.stderr.on("data", (data) => { errOutput += data.toString(); });

  ytdlp.on("close", (code) => {
    const directUrl = output.trim();
    if (code !== 0 || !directUrl) {
      console.error(`[STREAM] yt-dlp failed (${code}): ${errOutput}`);
      return res.status(500).json({ error: "Failed to resolve stream URL" });
    }
    console.log(`[STREAM] Redirecting ${videoId} -> ${directUrl.slice(0, 60)}...`);
    res.redirect(302, directUrl);
  });

  ytdlp.on("error", (err) => {
    console.error(`[STREAM] Spawn error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: "Stream resolution failed" });
  });
});

  ytdlp.on("error", (err) => {
    console.error(`[YT-DLP ERROR] ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp failed" });
    }
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      console.error(`[YT-DLP] Process exited with code ${code}`);
    }
  });

  req.on("close", () => {
    console.log(`[STREAM] Client disconnected for ${videoId}`);
    ytdlp.kill("SIGTERM");
  });
});

app.get("/metadata/:videoId", (req, res) => {
  const { videoId } = req.params;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const ytdlp = spawn("yt-dlp", [
    url,
    "--dump-json",
    "--no-warnings",
    "--no-playlist",
  ]);

  let stdout = "";

  ytdlp.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: "Failed to get metadata" });
    }
    try {
      const data = JSON.parse(stdout);
      res.json({
        title: data.title,
        channel: data.channel || data.uploader,
        thumbnail:
          data.thumbnails && data.thumbnails.length > 0
            ? data.thumbnails[data.thumbnails.length - 1].url
            : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: data.duration ? formatDuration(data.duration) : "Unknown",
        durationSeconds: data.duration || 0,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to parse metadata" });
    }
  });
});

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

app.use(express.static(CLIENT_DIST));

app.get("*", (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

async function start() {
  await db.connect();
  app.listen(PORT, HOST, () => {
    console.log(`\n🔥 Diable Jambe Server running on http://${HOST}:${PORT}`);
    console.log(`❧  Database: ${db.getBackend()}`);
    if (HOST === "0.0.0.0") {
      console.log(`❧  Open http://YOUR_PC_IP:${PORT} on Android to use Sanji.`);
    }
    console.log();
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
