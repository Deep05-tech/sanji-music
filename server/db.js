const { MongoClient } = require("mongodb");
const path = require("path");
const fs = require("fs");

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

// Resolve hostnames to IPs using Google DNS-over-HTTPS (port 443).
// This bypasses Render's DNS issues with Atlas hostnames.
async function dnsResolve(hostname) {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.Status === 0 && data.Answer) {
    const ip = data.Answer.find((a) => a.type === 1)?.data;
    if (ip) return ip;
  }
  throw new Error(`DNS resolution failed for ${hostname}`);
}

async function resolveHostsToIps(uri) {
  if (!uri.startsWith("mongodb://")) return uri;

  const authEnd = uri.indexOf("@");
  const afterHosts = uri.indexOf("/", authEnd > 0 ? authEnd : 8);
  const hostsPart = uri.slice(authEnd > 0 ? authEnd + 1 : 8, afterHosts > 0 ? afterHosts : undefined);

  const hosts = hostsPart.split(",");
  const resolved = [];

  for (const entry of hosts) {
    const [hostname, port] = entry.split(":");
    try {
      const ip = await dnsResolve(hostname);
      resolved.push(port ? `${ip}:${port}` : ip);
      console.log(`[DB] Resolved ${hostname} -> ${ip}`);
    } catch {
      console.warn(`[DB] Could not resolve ${hostname}, keeping original`);
      resolved.push(entry);
    }
  }

  let result = uri.slice(0, authEnd > 0 ? authEnd + 1 : 8);
  result += resolved.join(",");
  if (afterHosts > 0) result += uri.slice(afterHosts);
  return result;
}

async function connect() {
  if (!MONGODB_URI) {
    console.log("[DB] No MONGODB_URI set, using db.json");
    return;
  }

  let resolvedUri = MONGODB_URI;
  if (MONGODB_URI.startsWith("mongodb://")) {
    resolvedUri = await resolveHostsToIps(MONGODB_URI);
  }

  const tryConnect = async (options = {}) => {
    const client = new MongoClient(resolvedUri, options);
    await client.connect();
    mongoClient = client;
    mongoDb = client.db();
  };

  try {
    await tryConnect();
    console.log("[DB] Connected to MongoDB");
    return;
  } catch (err) {
    console.error("[DB] Initial connect failed:", err.message);
  }

  try {
    await tryConnect({ tlsInsecure: true, ssl: true, serverSelectionTimeoutMS: 10000 });
    console.log("[DB] Connected to MongoDB (fallback TLS)");
    return;
  } catch (err) {
    console.error("[DB] All MongoDB connection attempts failed:", err.message);
  }

  mongoClient = null;
  mongoDb = null;
}

async function close() {
  if (mongoClient) await mongoClient.close();
}

async function findUserByEmail(email) {
  if (isMongo()) return await mongoDb.collection("users").findOne({ email });
  return readJsonDb().users.find((u) => u.email === email) || null;
}

async function findUserById(id) {
  if (isMongo()) return await mongoDb.collection("users").findOne({ id });
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
