const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-this-secret-before-hosting-sanji";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

function setupCookies() {
  // Priority 1: YOUTUBE_COOKIES env var (base64-encoded cookies.txt content)
  const envCookies = process.env.YOUTUBE_COOKIES;
  if (envCookies) {
    try {
      const decoded = Buffer.from(envCookies, "base64").toString("utf8");
      fs.writeFileSync(COOKIES_PATH, decoded);
      console.log("[COOKIES] Written from YOUTUBE_COOKIES env var");
      return true;
    } catch (err) {
      console.error("[COOKIES] Failed to decode YOUTUBE_COOKIES env var:", err.message);
    }
  }
  // Priority 2: cookies.txt already exists in server/ dir
  if (fs.existsSync(COOKIES_PATH)) {
    console.log("[COOKIES] Found existing cookies.txt");
    return true;
  }
  console.warn("[COOKIES] No cookies configured — YouTube will likely block stream requests from data center IPs.");
  console.warn("[COOKIES] Set YOUTUBE_COOKIES env var (base64 of cookies.txt) or place cookies.txt in server/");
  return false;
}

function getCookiesArgs() {
  if (fs.existsSync(COOKIES_PATH)) {
    return ["--cookies", COOKIES_PATH];
  }
  return [];
}

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

const streamCache = new Map();
const STREAM_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

function getCachedStream(videoId) {
  const entry = streamCache.get(videoId);
  if (!entry) return null;
  if (Date.now() - entry.ts > STREAM_CACHE_TTL) {
    streamCache.delete(videoId);
    return null;
  }
  return entry.url;
}

function setCachedStream(videoId, url) {
  streamCache.set(videoId, { url, ts: Date.now() });
}

const CURATED_HOME_SECTIONS = {
  "global top songs 2024": [
    { title: "Overtaken (Luffy's Theme OST)", videoId: "8A-q3TM8kDM", thumbnail: "https://i.ytimg.com/vi/8A-q3TM8kDM/hqdefault.jpg", duration: "1:56", durationSeconds: 116, channel: "Kohei Tanaka" },
    { title: "Binks' Sake (Straw Hat Version)", videoId: "3gT41s_rIhc", thumbnail: "https://i.ytimg.com/vi/3gT41s_rIhc/hqdefault.jpg", duration: "3:24", durationSeconds: 204, channel: "Straw Hat Pirates" },
    { title: "We Are! (One Piece Theme Song)", videoId: "HR05p8W1a0I", thumbnail: "https://i.ytimg.com/vi/HR05p8W1a0I/hqdefault.jpg", duration: "4:00", durationSeconds: 240, channel: "Hiroshi Kitadani" },
    { title: "Sanji's Theme (Baratie Restaurant)", videoId: "PzE5JIoH4Lw", thumbnail: "https://i.ytimg.com/vi/PzE5JIoH4Lw/hqdefault.jpg", duration: "2:46", durationSeconds: 166, channel: "Kohei Tanaka" },
    { title: "The Very, Very, Very Strongest (OST)", videoId: "4J7K3yacig4", thumbnail: "https://i.ytimg.com/vi/4J7K3yacig4/hqdefault.jpg", duration: "1:44", durationSeconds: 104, channel: "Kohei Tanaka" },
    { title: "Drums of Liberation (Gear 5 Ost)", videoId: "t7D-9V3rY7A", thumbnail: "https://i.ytimg.com/vi/t7D-9V3rY7A/hqdefault.jpg", duration: "4:12", durationSeconds: 252, channel: "Samuel Kim Music" }
  ],
  "underground jazz lounge music": [
    { title: "Binks' Sake - Classy Jazz Cafe Cover", videoId: "sN_X0LgqM6M", thumbnail: "https://i.ytimg.com/vi/sN_X0LgqM6M/hqdefault.jpg", duration: "3:12", durationSeconds: 192, channel: "Baratie Cafe Jazz Band" },
    { title: "Autumn Leaves (Late Night Jazz Standard)", videoId: "r-Z811776gQ", thumbnail: "https://i.ytimg.com/vi/r-Z811776gQ/hqdefault.jpg", duration: "6:25", durationSeconds: 385, channel: "Cigarette Smoke Lounge" },
    { title: "Fly Me to the Moon (Cigarette Jazz Mix)", videoId: "mQR0bXO_yI8", thumbnail: "https://i.ytimg.com/vi/mQR0bXO_yI8/hqdefault.jpg", duration: "2:30", durationSeconds: 150, channel: "Frank Sinatra" },
    { title: "Take Five (Classic Baratie Jazz Session)", videoId: "vmDDOFXSgAs", thumbnail: "https://i.ytimg.com/vi/vmDDOFXSgAs/hqdefault.jpg", duration: "5:24", durationSeconds: 324, channel: "Dave Brubeck" },
    { title: "My Funny Valentine (Midnight Trumpet)", videoId: "jvXywhJpOKs", thumbnail: "https://i.ytimg.com/vi/jvXywhJpOKs/hqdefault.jpg", duration: "6:00", durationSeconds: 360, channel: "Chet Baker" },
    { title: "Blue In Green (Elegant Lounge Jazz)", videoId: "PoPL7BExSOU", thumbnail: "https://i.ytimg.com/vi/PoPL7BExSOU/hqdefault.jpg", duration: "5:38", durationSeconds: 338, channel: "Miles Davis" }
  ],
  "new music releases": [
    { title: "Luffy Gear 5 Theme (Epic Orchestral Remix)", videoId: "t7D-9V3rY7A", thumbnail: "https://i.ytimg.com/vi/t7D-9V3rY7A/hqdefault.jpg", duration: "4:12", durationSeconds: 252, channel: "Samuel Kim Music" },
    { title: "Baratie Bistro - Accordion French Waltz", videoId: "y6120Q5M03A", thumbnail: "https://i.ytimg.com/vi/y6120Q5M03A/hqdefault.jpg", duration: "3:30", durationSeconds: 210, channel: "Chef Sanji's Kitchen" },
    { title: "All Blue Ocean Chill Beats", videoId: "jfKfPfyJRdk", thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", duration: "4:15", durationSeconds: 255, channel: "Lofi Girl" },
    { title: "We Go! (Classy Acoustic Cover)", videoId: "f82yR3vN58A", thumbnail: "https://i.ytimg.com/vi/f82yR3vN58A/hqdefault.jpg", duration: "3:45", durationSeconds: 225, channel: "Straw Hat Acoustic" }
  ],
  "lofi dinner jazz beats": [
    { title: "Sanji Cooking Lofi - Chill Baratie Beats", videoId: "dQw4w9WgXcQ", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: "3:32", durationSeconds: 212, channel: "Baratie Chef Lofi" },
    { title: "Late Night Cigarette Smoke & Jazz Ambient", videoId: "54n9EtYp_0o", thumbnail: "https://i.ytimg.com/vi/54n9EtYp_0o/hqdefault.jpg", duration: "4:00:00", durationSeconds: 14400, channel: "Lofi Coffee Shop" },
    { title: "All Blue Sea breeze Relaxing Lofi", videoId: "2tK_MvP9x4s", thumbnail: "https://i.ytimg.com/vi/2tK_MvP9x4s/hqdefault.jpg", duration: "2:40", durationSeconds: 160, channel: "Grand Line Chill" },
    { title: "Binks' Sake (Straw Hat Lofi Sleep Mix)", videoId: "Qz8tS5d_61A", thumbnail: "https://i.ytimg.com/vi/Qz8tS5d_61A/hqdefault.jpg", duration: "3:05", durationSeconds: 185, channel: "Lofi Straw Hat" }
  ],
  "ocean jazz chill music": [
    { title: "All Blue Deep Sea Lounge Beats", videoId: "jfKfPfyJRdk", thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", duration: "4:15", durationSeconds: 255, channel: "Lofi Girl" },
    { title: "Binks' Sake (Sailing Accordion Cover)", videoId: "y6120Q5M03A", thumbnail: "https://i.ytimg.com/vi/y6120Q5M03A/hqdefault.jpg", duration: "3:30", durationSeconds: 210, channel: "Grand Line Orchestra" },
    { title: "Ocean Breeze Chill Jazz Piano", videoId: "2tK_MvP9x4s", thumbnail: "https://i.ytimg.com/vi/2tK_MvP9x4s/hqdefault.jpg", duration: "2:40", durationSeconds: 160, channel: "Sea Breeze Jazz" },
    { title: "Straw Hat Campfire Acoustic Chill", videoId: "f82yR3vN58A", thumbnail: "https://i.ytimg.com/vi/f82yR3vN58A/hqdefault.jpg", duration: "3:45", durationSeconds: 225, channel: "Starlight Acoustic" }
  ],
  "romantic dinner jazz": [
    { title: "My Funny Valentine (Warm Candlelight Trumpet)", videoId: "jvXywhJpOKs", thumbnail: "https://i.ytimg.com/vi/jvXywhJpOKs/hqdefault.jpg", duration: "6:00", durationSeconds: 360, channel: "Chet Baker" },
    { title: "Autumn Leaves (Chamber Quartet Live)", videoId: "r-Z811776gQ", thumbnail: "https://i.ytimg.com/vi/r-Z811776gQ/hqdefault.jpg", duration: "6:25", durationSeconds: 385, channel: "Elegant Strings" },
    { title: "Fly Me to the Moon (Slow Lounge Duo)", videoId: "mQR0bXO_yI8", thumbnail: "https://i.ytimg.com/vi/mQR0bXO_yI8/hqdefault.jpg", duration: "2:30", durationSeconds: 150, channel: "Baratie Duo" }
  ],
  "high energy funk rock": [
    { title: "Overtaken (Epic Orchestral Rock)", videoId: "8A-q3TM8kDM", thumbnail: "https://i.ytimg.com/vi/8A-q3TM8kDM/hqdefault.jpg", duration: "1:56", durationSeconds: 116, channel: "Epic Symphony" },
    { title: "Luffy Gear 5 - Drums of Liberation (Funk Rock)", videoId: "t7D-9V3rY7A", thumbnail: "https://i.ytimg.com/vi/t7D-9V3rY7A/hqdefault.jpg", duration: "4:12", durationSeconds: 252, channel: "Samuel Kim Music" },
    { title: "We Are! (Power Metal Version)", videoId: "HR05p8W1a0I", thumbnail: "https://i.ytimg.com/vi/HR05p8W1a0I/hqdefault.jpg", duration: "4:00", durationSeconds: 240, channel: "Grand Line Metal" }
  ],
  "underground jazz bar": [
    { title: "Take Five (Classic Club Quintet)", videoId: "vmDDOFXSgAs", thumbnail: "https://i.ytimg.com/vi/vmDDOFXSgAs/hqdefault.jpg", duration: "5:24", durationSeconds: 324, channel: "Dave Brubeck" },
    { title: "Blue In Green (Quiet Bar Session)", videoId: "PoPL7BExSOU", thumbnail: "https://i.ytimg.com/vi/PoPL7BExSOU/hqdefault.jpg", duration: "5:38", durationSeconds: 338, channel: "Miles Davis" }
  ],
  "focus cooking playlist": [
    { title: "Sanji Cooking Lofi - Focus Beat Mix", videoId: "dQw4w9WgXcQ", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: "3:32", durationSeconds: 212, channel: "Baratie Kitchen Lofi" },
    { title: "Late Night Cigarette Smoke & Writing Jazz", videoId: "54n9EtYp_0o", thumbnail: "https://i.ytimg.com/vi/54n9EtYp_0o/hqdefault.jpg", duration: "4:00:00", durationSeconds: 14400, channel: "Lofi Coffee Shop" }
  ],
  "jazz bar": [
    { title: "Take Five (Classic Jazz)", videoId: "vmDDOFXSgAs", thumbnail: "https://i.ytimg.com/vi/vmDDOFXSgAs/hqdefault.jpg", duration: "5:24", durationSeconds: 324, channel: "Dave Brubeck" },
    { title: "Blue In Green (Classic Trumpet)", videoId: "PoPL7BExSOU", thumbnail: "https://i.ytimg.com/vi/PoPL7BExSOU/hqdefault.jpg", duration: "5:38", durationSeconds: 338, channel: "Miles Davis" },
    { title: "My Funny Valentine (Smooth Vocal)", videoId: "jvXywhJpOKs", thumbnail: "https://i.ytimg.com/vi/jvXywhJpOKs/hqdefault.jpg", duration: "6:00", durationSeconds: 360, channel: "Chet Baker" }
  ],
  "fine dining": [
    { title: "Baratie Bistro - Accordion French Waltz", videoId: "y6120Q5M03A", thumbnail: "https://i.ytimg.com/vi/y6120Q5M03A/hqdefault.jpg", duration: "3:30", durationSeconds: 210, channel: "Chef Sanji's Kitchen" },
    { title: "Autumn Leaves (Bossa Nova Mix)", videoId: "r-Z811776gQ", thumbnail: "https://i.ytimg.com/vi/r-Z811776gQ/hqdefault.jpg", duration: "6:25", durationSeconds: 385, channel: "Bistro Quartet" }
  ],
  "late night": [
    { title: "Late Night Cigarette Smoke & Jazz Ambient", videoId: "54n9EtYp_0o", thumbnail: "https://i.ytimg.com/vi/54n9EtYp_0o/hqdefault.jpg", duration: "4:00:00", durationSeconds: 14400, channel: "Lofi Coffee Shop" },
    { title: "Binks' Sake (Violin Night Cover)", videoId: "sN_X0LgqM6M", thumbnail: "https://i.ytimg.com/vi/sN_X0LgqM6M/hqdefault.jpg", duration: "3:12", durationSeconds: 192, channel: "Baratie Cafe Jazz Band" }
  ],
  "acoustic": [
    { title: "We Go! (Classy Acoustic Cover)", videoId: "f82yR3vN58A", thumbnail: "https://i.ytimg.com/vi/f82yR3vN58A/hqdefault.jpg", duration: "3:45", durationSeconds: 225, channel: "Straw Hat Acoustic" },
    { title: "Binks' Sake (Sailing Accordion Cover)", videoId: "y6120Q5M03A", thumbnail: "https://i.ytimg.com/vi/y6120Q5M03A/hqdefault.jpg", duration: "3:30", durationSeconds: 210, channel: "Grand Line Orchestra" }
  ],
  "chef focus": [
    { title: "Sanji Cooking Lofi - Chill Baratie Beats", videoId: "dQw4w9WgXcQ", thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", duration: "3:32", durationSeconds: 212, channel: "Baratie Chef Lofi" }
  ],
  "soul": [
    { title: "Binks' Sake (Straw Hat Version)", videoId: "3gT41s_rIhc", thumbnail: "https://i.ytimg.com/vi/3gT41s_rIhc/hqdefault.jpg", duration: "3:24", durationSeconds: 204, channel: "Straw Hat Pirates" }
  ],
  "all blue": [
    { title: "All Blue Ocean Chill Beats", videoId: "jfKfPfyJRdk", thumbnail: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", duration: "4:15", durationSeconds: 255, channel: "Lofi Girl" },
    { title: "Ocean Breeze Chill Jazz Piano", videoId: "2tK_MvP9x4s", thumbnail: "https://i.ytimg.com/vi/2tK_MvP9x4s/hqdefault.jpg", duration: "2:40", durationSeconds: 160, channel: "Sea Breeze Jazz" }
  ],
  "candlelight": [
    { title: "My Funny Valentine (Warm Candlelight Trumpet)", videoId: "jvXywhJpOKs", thumbnail: "https://i.ytimg.com/vi/jvXywhJpOKs/hqdefault.jpg", duration: "6:00", durationSeconds: 360, channel: "Chet Baker" },
    { title: "Fly Me to the Moon (Slow Lounge Duo)", videoId: "mQR0bXO_yI8", thumbnail: "https://i.ytimg.com/vi/mQR0bXO_yI8/hqdefault.jpg", duration: "2:30", durationSeconds: 150, channel: "Baratie Duo" }
  ]
};

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

  const cleanQuery = query.toLowerCase().trim();
  if (CURATED_HOME_SECTIONS[cleanQuery]) {
    console.log(`[SEARCH] Curated query hit for: "${query}"`);
    return res.json({ results: CURATED_HOME_SECTIONS[cleanQuery] });
  }

  const cached = getCachedSearch(query);
  if (cached) {
    console.log(`[SEARCH] Cache hit for: "${query}"`);
    return res.json(cached);
  }

  console.log(`[SEARCH] Searching for: "${query}"`);

  const args = [
    `ytsearch12:${query}`,
    "--dump-json",
    "--flat-playlist",
    "--no-warnings",
    "--default-search", "ytsearch",
    "--extractor-args", "youtube:player_client=android,ios;player_skip=webpage",
    "--no-check-certificate",
    ...getCookiesArgs(),
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

  const cachedUrl = getCachedStream(videoId);
  if (cachedUrl) {
    console.log(`[STREAM] Cache hit for: ${videoId}`);
    return res.redirect(302, cachedUrl);
  }

  console.log(`[STREAM] Resolving direct URL for: ${videoId}`);

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const ytdlp = spawn("yt-dlp", [
    url,
    "-f", "bestaudio",
    "--get-url",
    "--no-warnings",
    "--no-playlist",
    "--extractor-args", "youtube:player_client=android,ios;player_skip=webpage",
    "--no-check-certificate",
    ...getCookiesArgs(),
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
    setCachedStream(videoId, directUrl);
    res.redirect(302, directUrl);
  });

  ytdlp.on("error", (err) => {
    console.error(`[STREAM] Spawn error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: "Stream resolution failed" });
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
  const hasCookies = setupCookies();
  await db.connect();
  app.listen(PORT, HOST, () => {
    console.log(`\n🔥 Diable Jambe Server running on http://${HOST}:${PORT}`);
    console.log(`❧  Database: ${db.getBackend()}`);
    console.log(`❧  Cookies: ${hasCookies ? "✓ loaded" : "✗ not configured (streams may fail)"}`);
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
