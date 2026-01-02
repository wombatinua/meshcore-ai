-- Schema bootstrap for meshcore-ai

CREATE TABLE IF NOT EXISTS adverts (
	public_key TEXT PRIMARY KEY,
	type TEXT,
	adv_name TEXT,
	last_advert INTEGER,
	last_mod INTEGER,
	adv_lat TEXT,
	adv_lon TEXT,
	timestamp INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_adverts_adv_name_last_mod_timestamp ON adverts(adv_name, last_mod, timestamp);

CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	public_key TEXT,
	channel_idx INTEGER,
	channel_name TEXT,
	adv_name TEXT,
	sender_timestamp INTEGER,
	text TEXT,
	timestamp INTEGER DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_timestamp ON messages(channel_idx, sender_timestamp);
