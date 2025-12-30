import fs from "node:fs";
import * as helpers from "./helpers.js";
import * as database from "./database.js";
import * as cache from "./cache.js";
import HttpServer from "./server.js";
import Constants from "meshcore.js/src/constants.js";
import NodeJSSerialConnection from "meshcore.js/src/connection/nodejs_serial_connection.js";

const httpHost = process.env.HTTP_HOST || "localhost";
const httpPort = Number(process.env.HTTP_PORT) || 8080;
const httpApi = process.env.HTTP_API || "/api";
const meshcoreDevice = process.env.MESHCORE_DEVICE;
const reconnectDelay = Number(process.env.RECONNECT_DELAY);
const connection = new NodeJSSerialConnection(meshcoreDevice);

// ensure database is initialized (and migrations applied when forced)
try {
	database.getDatabasePath();
} catch (error) {
	console.log("Database init failed", error);
}

let selfInfo = {};
let isConnected = false;
let reconnectTimer = null;
let missingDeviceLogged = false;

// http api handlers whitelist
const actionHandlers = {

	apiReboot,
	apiSyncDeviceTime,
	apiSendFloodAdvert,
	apiSendZeroHopAdvert,
	apiGetContacts,
	apiGetChannels,
	apiGetAdverts,
	apiGetMessages
};

// start http server
const httpServer = new HttpServer({
	port: httpPort,
	host: httpHost,
	apiPath: httpApi,
	root: "http",
	actions: actionHandlers
});

await httpServer.start();

// HTTP API METHODS

// reboot device
async function apiReboot(params) {

	console.log("apiReboot", params);

	try {
		// fire-and-forget reboot; resolves after a short delay inside meshcore.js
		await connection.reboot();
		return { message: "Device reboot command sent" };
	} catch (error) {
		console.log("apiReboot failed", error);
		return { message: "Device reboot failed", error: error?.message || String(error) };
	}
}

// sync device RTC with host clock
async function apiSyncDeviceTime(params) {

	console.log("apiSyncDeviceTime", params);

	try {
		await connection.syncDeviceTime();
		return { message: "Device time synchronized" };
	} catch (error) {
		console.log("apiSyncDeviceTime failed", error);
		return { message: "Device time sync failed", error: error?.message || String(error) };
	}
}

// broadcast flood advert
async function apiSendFloodAdvert(params) {

	console.log("apiSendFloodAdvert", params);

	try {
		// mesh-wide advert
		await connection.sendFloodAdvert();
		return { message: "Flood advert sent" };
	} catch (error) {
		console.log("apiSendFloodAdvert failed", error);
		return { message: "Flood advert failed", error: error?.message || String(error) };
	}
}

// broadcast zero-hop advert
async function apiSendZeroHopAdvert(params) {

	console.log("apiSendZeroHopAdvert", params);

	try {
		// local-only advert
		await connection.sendZeroHopAdvert();
		return { message: "Zero-hop advert sent" };
	} catch (error) {
		console.log("apiSendZeroHopAdvert failed", error);
		return { message: "Zero-hop advert failed", error: error?.message || String(error) };
	}
}

// get contacts and format readable fields
async function apiGetContacts(params) {

	console.log("apiGetContacts", params);

	try {
		// prefer cache; otherwise pull fresh and refresh cache
		let contactsRaw = cache.hasCachedContacts() ? cache.getCachedContacts() : await connection.getContacts();
		if (contactsRaw?.length) cache.cacheContacts(contactsRaw);

		const contacts = contactsRaw.map((contact) => {

			const publicKey = helpers.bytesToHex(contact.publicKey);
			const type = helpers.constantKey(Constants.AdvType, contact.type).toLowerCase();
			const lastAdvert = helpers.formatDateTime(contact.lastAdvert);
			const lastMod = helpers.formatDateTime(contact.lastMod);
			const advLat = contact.advLat != null ? (contact.advLat / 1e6).toFixed(6) : "";
			const advLon = contact.advLon != null ? (contact.advLon / 1e6).toFixed(6) : "";

			const {
				outPath: _omitOutPath,
				outPathLen: _omitOutPathLen,
				flags: _omitFlags,
				...rest
			} = contact;

			return {
				...rest,
				publicKey,
				type,
				lastAdvert,
				lastMod,
				advLat,
				advLon
			};
		});

		return { contacts };
	} catch (error) {
		console.log("apiGetContacts failed", error);
		return { message: "Contacts retrieval failed", error: error?.message || String(error) };
	}
}

// get channels and drop empty slots, hex-encode secret
async function apiGetChannels(params) {

	console.log("apiGetChannels", params);

	try {
		const channelsRaw = await connection.getChannels();
		const channels = channelsRaw.map((channel) => {

			const { secret, ...rest } = channel;
			const secretHex = helpers.bytesToHex(secret);

			return {
				...rest,
				secret: secretHex
			};
		}).filter((channel) => channel.name || (channel.secret && !/^0+$/.test(channel.secret)));

		return { channels };
	} catch (error) {
		console.log("apiGetChannels failed", error);
		return { message: "Channels retrieval failed", error: error?.message || String(error) };
	}
}

// get stored adverts
async function apiGetAdverts(params) {

	console.log("apiGetAdverts", params);

	try {
		const adverts = database.getAdverts();
		return { adverts };
	} catch (error) {
		console.log("apiGetAdverts failed", error);
		return { message: "Adverts retrieval failed", error: error?.message || String(error) };
	}
}

// get stored messages
async function apiGetMessages(params) {

	console.log("apiGetMessages", params);

	try {
		const limit = typeof params?.limit === "number" ? params.limit : 100;
		const messages = database.getMessages(limit);
		return { messages };
	} catch (error) {
		console.log("apiGetMessages failed", error);
		return { message: "Messages retrieval failed", error: error?.message || String(error) };
	}
}

// DEVICE EVENTS

// wait on device connection
connection.on("connected", async () => {

	isConnected = true;
	missingDeviceLogged = false;
	clearReconnectTimer();

	// refresh contacts cache on connect
	try {
		const contacts = await connection.getContacts();
		cache.cacheContacts(contacts);
	} catch (error) {
		console.log("Failed to warm contact cache", error);
	}

	selfInfo = await connection.getSelfInfo();
	selfInfo.advType = helpers.constantKey(Constants.AdvType, selfInfo.type).toLowerCase();

	console.log(selfInfo.name + " (" + selfInfo.advType + ") connected on " + meshcoreDevice);

	// update device clock
	await connection.syncDeviceTime();

	// send zero-hop advert
	await connection.sendZeroHopAdvert();

	// send flood advert
	// await connection.sendFloodAdvert();
});

// wait on device disconnection
connection.on("disconnected", async () => {

	isConnected = false;
	console.log(selfInfo.name + " (" + selfInfo.advType + ") disconnected from " + meshcoreDevice);

	// reconnect if RECONNECT_DELAY present
	queueReconnect();
});

// handle serial/device errors and retry after delay
connection.on("error", (error) => {

	isConnected = false;
	console.log("Connection error", error?.message || error);
	queueReconnect();
});

// wait on incoming messages -->
// onContactMessageReceived / onChannelMessageReceived
connection.on(Constants.PushCodes.MsgWaiting, async () => {

	try {
		const waitingMessages = await connection.getWaitingMessages();

		for (const message of waitingMessages) {

			// message received from contact
			if (message.contactMessage) await onContactMessageReceived(message.contactMessage);

			// message received from channel
			if (message.channelMessage) await onChannelMessageReceived(message.channelMessage);
		}
	} catch (error) {
		console.log(error);
	}
});

// wait on adverts (full & public key only) --> onAdvertReceived
[Constants.PushCodes.NewAdvert, Constants.PushCodes.Advert].forEach((pushCode) => {

	connection.on(pushCode, async (advert) => {
		try {
			await onAdvertReceived(advert);
		} catch (error) {
			console.log(error);
		}
	});
});

// advert received
async function onAdvertReceived(advert) {

	// start with public key
	const publicKey = helpers.bytesToHex(advert.publicKey);

	// fetch contact info (same helper used in onContactMessageReceived), prefer cache
	const cachedContact = cache.getCachedContactByPublicKey(advert.publicKey);
	const contact = cachedContact || await connection.findContactByPublicKeyPrefix(advert.publicKey).catch((error) => {
		console.log("Failed to fetch contact info for advert", error);
		return null;
	});

	// helper to pick a value from advert, falling back to contact fields
	const pick = (field, transform = (v) => v) => {

		const advVal = advert[field];
		if (advVal != null) return transform(advVal);
		if (!contact) return undefined;
		return transform(contact[field]);
	};

	const type = pick("type", (t) => helpers.constantKey(Constants.AdvType, t).toLowerCase());
	//const outPathLen = pick("outPathLen");
	//const outPath = pick("outPath", (v) => helpers.bytesToHex(v, outPathLen > 0 ? outPathLen : undefined));
	//const flags = pick("flags");
	const lastAdvertRaw = pick("lastAdvert");
	const lastModRaw = pick("lastMod");
	const lastAdvert = lastAdvertRaw != null ? helpers.formatDateTime(lastAdvertRaw) : "";
	const lastMod = lastModRaw != null ? helpers.formatDateTime(lastModRaw) : "";
	const advLat = pick("advLat", (v) => (v != null ? (v / 1e6).toFixed(6) : ""));
	const advLon = pick("advLon", (v) => (v != null ? (v / 1e6).toFixed(6) : ""));
	const advName = pick("advName");

	// update cached contact info from advert
	cache.cacheContact({
		publicKey: advert.publicKey,
		advName,
		lastAdvert: lastAdvertRaw,
		lastMod: lastModRaw
	});

	// save advert in database
	try {
		database.upsertAdvert({
			publicKey,
			type,
			advName,
			lastAdvert: lastAdvertRaw,
			lastMod: lastModRaw,
			advLat,
			advLon
		});
	} catch (error) {
		console.log("Failed to persist advert", error);
	}

	console.log("Received adevert", {
		publicKey,
		type,
		//flags,
		//outPathLen,
		//outPath,
		advName,
		lastAdvert,
		lastMod,
		advLat,
		advLon
	});
}

// contact message received
async function onContactMessageReceived(message) {

	// get contact name by prefix (cache first)
	const contact = cache.getCachedContactByPrefix(message.pubKeyPrefix) || await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
	const contactName = contact?.advName || "Unknown";

	console.log("Received contact message", contactName, message);

	// save message in database
	try {
		if (contact) cache.cacheContact(contact);
		database.saveMessage({
			publicKey: contact?.publicKeyHex || (contact ? helpers.bytesToHex(contact.publicKey) : null),
			advName: contact?.advName || null,
			senderTimestamp: message.senderTimestamp,
			text: message.text
		});
	} catch (error) {
		console.log("Failed to persist contact message", error);
	}

	if (!contact) {

		console.log("Unknown contact");
		return;
	}

	await connection.sendTextMessage(contact.publicKey, message.text, Constants.TxtTypes.Plain);
}

// channel message received
async function onChannelMessageReceived(message) {

	// get channel name by id
	const channelInfo = await connection.getChannel(message.channelIdx);
	const channelName = channelInfo.name;

	// attempt to split "advName: text"
	let advName = null;
	let parsedText = message.text;
	const match = message.text.match(/^(.*?):\s?(.*)$/);
	if (match) {
		advName = match[1];
		parsedText = match[2];
	}

	console.log("Received channel message", channelName, { ...message, text: parsedText, advName });

	let contactPublicKey = null;
	if (advName) {
		try {
			const contact = await cache.resolveContactByAdvName(advName, connection);
			if (contact) {
				contactPublicKey = contact.publicKeyHex;
			} else {

				// fallback to adverts table for previously-seen public keys
				const adverts = database.findAdvertsByName(advName, 3);
				const uniqueKeys = Array.from(new Set(adverts.map((advert) => advert.public_key).filter(Boolean)));

				if (uniqueKeys.length === 1) {

					contactPublicKey = uniqueKeys[0];

					// cache a synthetic contact entry to speed up further lookups
					cache.cacheContact({
						publicKey: Buffer.from(uniqueKeys[0], "hex"),
						advName,
						lastMod: adverts[0]?.last_mod
					});

					console.log("Resolved contact via adverts fallback", { advName, publicKey: contactPublicKey });
				} else if (uniqueKeys.length > 1) {

					console.log("Ambiguous adverts for advName, keeping publicKey null", { advName, keys: uniqueKeys });
				}
			}
		} catch (error) {
			console.log("Failed to resolve contact by advName", error);
		}
	}

	// save message in database
	try {
		database.saveMessage({
			channelIdx: message.channelIdx,
			channelName,
			advName,
			publicKey: contactPublicKey,
			senderTimestamp: message.senderTimestamp,
			text: parsedText
		});
	} catch (error) {
		console.log("Failed to persist channel message", error);
	}
}

// (re)connect to device
async function connectDevice() {

	// avoid hammering when device path is absent
	if (meshcoreDevice && !fs.existsSync(meshcoreDevice)) {
		if (!missingDeviceLogged) {
			console.log(`Device path not found: ${meshcoreDevice} (retry every ${reconnectDelay} ms)`);
			missingDeviceLogged = true;
		}
		return queueReconnect();
	}

	try {
		await connection.connect();
	} catch (error) {
		console.log(error.message);

		queueReconnect();
		return;
	}

	// watchdog: if not connected within delay, try again
	if (reconnectDelay) {
		setTimeout(() => {
			if (!isConnected) queueReconnect();
		}, reconnectDelay);
	}
}

// schedule a delayed reconnect once
function queueReconnect() {
	if (!reconnectDelay || reconnectTimer) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connectDevice();
	}, reconnectDelay);
}

function clearReconnectTimer() {
	if (!reconnectTimer) return;
	clearTimeout(reconnectTimer);
	reconnectTimer = null;
}

// connect device on launch
await connectDevice();
