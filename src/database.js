import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbFileName = process.env.SQLITE_DB || "sqlite.db";
const dbPath = path.isAbsolute(dbFileName) ? dbFileName : path.join(__dirname, dbFileName);
const migrationPath = path.join(__dirname, "migration.sql");
const forceMigrate = process.env.SQLITE_FORCE_MIGRATE === "true";
const journalMode = (process.env.SQLITE_JOURNAL_MODE || "wal").trim();

let dbInstance = null;
let migrationsApplied = false;

function initDatabase() {

	if (dbInstance) return dbInstance;

	// create on first use
	const isNew = !fs.existsSync(dbPath);
	dbInstance = new Database(dbPath);

	// prefer WAL for better concurrent reads/writes unless disabled
	if (journalMode) {
		dbInstance.pragma(`journal_mode = ${journalMode}`);
	}

	// run bootstrap schema on new db or when forced via env
	if (isNew || (forceMigrate && !migrationsApplied)) {
		runMigrations(dbInstance);
		migrationsApplied = true;
	}

	return dbInstance;
}

// apply migration script once on new db
function runMigrations(db) {

	if (!fs.existsSync(migrationPath)) {
		throw new Error(`Migration file not found at ${migrationPath}`);
	}

	const migrationSql = fs.readFileSync(migrationPath, "utf8").trim();
	if (!migrationSql) return; // single-shot schema creation
	db.exec(migrationSql);
}

// normalize undefined to null for sqlite
function nullish(value) {
	return value === undefined ? null : value;
}

// insert or update advert by public key
export function upsertAdvert({
	publicKey,
	type,
	advName,
	lastAdvert,
	lastMod,
	advLat,
	advLon
}) {

	const db = initDatabase();

	db.prepare(`
		INSERT INTO adverts (public_key, type, adv_name, last_advert, last_mod, adv_lat, adv_lon, timestamp)
		VALUES (@publicKey, @type, @advName, @lastAdvert, @lastMod, @advLat, @advLon, datetime('now'))
		ON CONFLICT(public_key) DO UPDATE SET
			type = excluded.type,
			adv_name = excluded.adv_name,
			last_advert = excluded.last_advert,
			last_mod = excluded.last_mod,
			adv_lat = excluded.adv_lat,
			adv_lon = excluded.adv_lon,
			timestamp = datetime('now')
	`).run({
		publicKey,
		type: nullish(type),
		advName: nullish(advName),
		lastAdvert: nullish(lastAdvert),
		lastMod: nullish(lastMod),
		advLat: nullish(advLat),
		advLon: nullish(advLon)
	});
}

// store an incoming message (contact or channel)
export function saveMessage({
	publicKey = null,
	channelIdx = null,
	channelName = null,
	advName = null,
	senderTimestamp = null,
	text
}) {

	const db = initDatabase();

	db.prepare(`
		INSERT INTO messages (public_key, channel_idx, channel_name, adv_name, sender_timestamp, text, timestamp)
		VALUES (@publicKey, @channelIdx, @channelName, @advName, @senderTimestamp, @text, datetime('now'))
	`).run({
		publicKey: nullish(publicKey),
		channelIdx: nullish(channelIdx),
		channelName: nullish(channelName),
		advName: nullish(advName),
		senderTimestamp: nullish(senderTimestamp),
		text: nullish(text)
	});
}

// fetch recent adverts by name (for fallback resolution)
export function findAdvertsByName(advName, limit = 3) {
	const db = initDatabase();
	return db.prepare(`
		SELECT public_key, adv_name, last_mod, timestamp
		FROM adverts
		WHERE adv_name = ?
		ORDER BY COALESCE(last_mod, 0) DESC, datetime(timestamp) DESC
		LIMIT ?
	`).all(advName, limit);
}

// fetch all adverts
export function getAdverts() {
	const db = initDatabase();
	return db.prepare("SELECT * FROM adverts").all();
}

// fetch recent messages (default 100)
export function getMessages(limit = 100) {
	const db = initDatabase();
	return db.prepare("SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?").all(limit);
}

// expose resolved db path (ensures init)
export function getDatabasePath() {
	initDatabase();
	return dbPath;
}
