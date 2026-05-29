const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

let pool = null;

function ensureJsonDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], libraries: {} }, null, 2));
  }
}

function readJsonDb() {
  ensureJsonDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeJsonDb(data) {
  ensureJsonDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function isPg() {
  return pool !== null;
}

async function connect() {
  const PG_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!PG_URI) {
    console.log("[DB] No database URI set, using db.json");
    return;
  }
  if (!PG_URI.startsWith("postgresql://")) {
    console.log("[DB] URI is not PostgreSQL, using db.json");
    return;
  }

  try {
    // Resolve hostname to IPv4 via Google DNS-over-HTTPS (bypasses Render's DNS)
    const parsed = new URL(PG_URI);
    const hostname = parsed.hostname;
    let resolvedIp = hostname;
    try {
      const dnsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`);
      const dnsData = await dnsRes.json();
      if (dnsData.Status === 0 && dnsData.Answer) {
        const ip = dnsData.Answer.find((a) => a.type === 1)?.data;
        if (ip) {
          resolvedIp = ip;
          console.log(`[DB] Resolved ${hostname} -> ${resolvedIp}`);
        }
      }
    } catch (dnsErr) {
      console.warn(`[DB] DNS-over-HTTPS failed for ${hostname}:`, dnsErr.message);
    }
    parsed.hostname = resolvedIp;
    const resolvedUri = parsed.toString();

    const { Pool } = require("pg");
    pool = new Pool({ connectionString: resolvedUri, ssl: { rejectUnauthorized: false } });

    // Test connection
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libraries (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        liked_songs JSONB DEFAULT '{}',
        playlists JSONB DEFAULT '[]',
        recently_played JSONB DEFAULT '[]',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log("[DB] Connected to PostgreSQL");
  } catch (err) {
    console.error("[DB] PostgreSQL connection failed:", err.message);
    await close();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

async function findUserByEmail(email) {
  if (isPg()) {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0] || null;
  }
  return readJsonDb().users.find((u) => u.email === email) || null;
}

async function findUserById(id) {
  if (isPg()) {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] || null;
  }
  return readJsonDb().users.find((u) => u.id === id) || null;
}

async function emailExists(email) {
  if (isPg()) {
    const result = await pool.query("SELECT 1 FROM users WHERE email = $1 LIMIT 1", [email]);
    return result.rowCount > 0;
  }
  return readJsonDb().users.some((u) => u.email === email);
}

async function createUser(user) {
  if (isPg()) {
    await pool.query(
      "INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
      [user.id, user.name, user.email, user.passwordHash, user.createdAt]
    );
    return;
  }
  const data = readJsonDb();
  data.users.push(user);
  writeJsonDb(data);
}

async function initLibrary(userId) {
  if (isPg()) {
    await pool.query(
      "INSERT INTO libraries (user_id, liked_songs, playlists, recently_played) VALUES ($1, '{}', '[]', '[]') ON CONFLICT (user_id) DO NOTHING",
      [userId]
    );
    return;
  }
  const data = readJsonDb();
  data.libraries[userId] = { likedSongs: {}, playlists: [], recentlyPlayed: [] };
  writeJsonDb(data);
}

async function getLibrary(userId) {
  if (isPg()) {
    const result = await pool.query("SELECT * FROM libraries WHERE user_id = $1", [userId]);
    if (result.rows.length === 0) return { likedSongs: {}, playlists: [], recentlyPlayed: [] };
    const row = result.rows[0];
    return {
      likedSongs: row.liked_songs || {},
      playlists: row.playlists || [],
      recentlyPlayed: row.recently_played || [],
    };
  }
  const data = readJsonDb();
  return data.libraries[userId] || { likedSongs: {}, playlists: [], recentlyPlayed: [] };
}

async function setLibrary(userId, library) {
  if (isPg()) {
    await pool.query(
      `INSERT INTO libraries (user_id, liked_songs, playlists, recently_played, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         liked_songs = $2, playlists = $3, recently_played = $4, updated_at = NOW()`,
      [userId, JSON.stringify(library.likedSongs), JSON.stringify(library.playlists), JSON.stringify(library.recentlyPlayed)]
    );
    return;
  }
  const data = readJsonDb();
  data.libraries[userId] = { ...library, updatedAt: new Date().toISOString() };
  writeJsonDb(data);
}

function getBackend() {
  return isPg() ? "postgresql" : "db.json";
}

module.exports = { connect, close, findUserByEmail, findUserById, emailExists, createUser, initLibrary, getLibrary, setLibrary, getBackend };
