const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");
const dns = require("dns");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const MONGODB_URI = process.env.MONGODB_URI;

let mongoClient = null;
let mongoDb = null;

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

function isMongo() {
  return mongoClient !== null && mongoDb !== null;
}

async function connect() {
  if (!MONGODB_URI) {
    console.log("[DB] No MONGODB_URI set, using db.json");
    return;
  }

  // Fix DNS resolution for mongodb+srv:// URIs on Alpine/Render
  if (MONGODB_URI.startsWith("mongodb+srv://")) {
    try {
      dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
    } catch (_) {}
  }

  const tryConnect = async (options = {}) => {
    const client = new MongoClient(MONGODB_URI, options);
    await client.connect();
    mongoClient = client;
    mongoDb = client.db();
  };

  try {
    await tryConnect();
    console.log("[DB] Connected to MongoDB");
  } catch (err) {
    const msg = err.message || "";
    if (msg.includes("querySrv") || msg.includes("ENOTFOUND")) {
      console.log("[DB] SRV DNS failed, retrying with direct DNS ...");
      dns.setServers(["8.8.8.8", "8.8.4.4"]);
      try {
        await tryConnect({ serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
        console.log("[DB] Connected to MongoDB (direct DNS)");
        return;
      } catch (retryErr) {
        console.error("[DB] MongoDB still unreachable:", retryErr.message);
      }
    } else if (msg.includes("SSL") || msg.includes("ssl") || msg.includes("TLS") || msg.includes("tls")) {
      console.log("[DB] TLS error, retrying with relaxed TLS ...");
      try {
        await tryConnect({ tls: true, tlsAllowInvalidCertificates: true });
        console.log("[DB] Connected to MongoDB (relaxed TLS)");
        return;
      } catch (retryErr) {
        console.error("[DB] MongoDB connection failed (relaxed TLS too):", retryErr.message);
      }
    } else {
      console.error("[DB] MongoDB connection failed:", msg);
    }

    mongoClient = null;
    mongoDb = null;
    console.log("[DB] Falling back to db.json. If you see 'querySrv ENOTFOUND', get a non-SRV connection string from Atlas -> Connect -> Drivers -> toggle to 'Standard connection format'");
  }
}

async function close() {
  if (mongoClient) await mongoClient.close();
}

async function findUserByEmail(email) {
  if (isMongo()) {
    return await mongoDb.collection("users").findOne({ email });
  }
  return readJsonDb().users.find((u) => u.email === email) || null;
}

async function findUserById(id) {
  if (isMongo()) {
    return await mongoDb.collection("users").findOne({ id });
  }
  return readJsonDb().users.find((u) => u.id === id) || null;
}

async function emailExists(email) {
  if (isMongo()) {
    const count = await mongoDb.collection("users").countDocuments({ email }, { limit: 1 });
    return count > 0;
  }
  return readJsonDb().users.some((u) => u.email === email);
}

async function createUser(user) {
  if (isMongo()) {
    await mongoDb.collection("users").insertOne(user);
    return;
  }
  const data = readJsonDb();
  data.users.push(user);
  writeJsonDb(data);
}

async function initLibrary(userId) {
  const lib = { likedSongs: {}, playlists: [], recentlyPlayed: [] };
  if (isMongo()) {
    await mongoDb.collection("libraries").insertOne({ userId, ...lib });
    return;
  }
  const data = readJsonDb();
  data.libraries[userId] = lib;
  writeJsonDb(data);
}

async function getLibrary(userId) {
  if (isMongo()) {
    const lib = await mongoDb.collection("libraries").findOne({ userId });
    if (!lib) return { likedSongs: {}, playlists: [], recentlyPlayed: [] };
    const { _id, ...rest } = lib;
    return rest;
  }
  const data = readJsonDb();
  return data.libraries[userId] || { likedSongs: {}, playlists: [], recentlyPlayed: [] };
}

async function setLibrary(userId, library) {
  const data = { ...library, updatedAt: new Date().toISOString() };
  if (isMongo()) {
    await mongoDb.collection("libraries").updateOne(
      { userId },
      { $set: { ...data, userId } },
      { upsert: true }
    );
    return;
  }
  const db = readJsonDb();
  db.libraries[userId] = data;
  writeJsonDb(db);
}

function getBackend() {
  return isMongo() ? "mongodb" : "db.json";
}

module.exports = { connect, close, findUserByEmail, findUserById, emailExists, createUser, initLibrary, getLibrary, setLibrary, getBackend };
