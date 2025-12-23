import * as helpers from "./helpers.js";
import HttpServer from "./server.js";
import Constants from "meshcore.js/src/constants.js";
import NodeJSSerialConnection from "meshcore.js/src/connection/nodejs_serial_connection.js";

const httpHost = process.env.HTTP_HOST || "localhost";
const httpPort = Number(process.env.HTTP_PORT) || 8080;
const httpApi = process.env.HTTP_API || "/api";
const meshcoreDevice = process.env.MESHCORE_DEVICE;
const reconnectDelay = Number(process.env.RECONNECT_DELAY);
const connection = new NodeJSSerialConnection(meshcoreDevice);

let selfInfo = {};

// http api handlers
const actionHandlers = {

	apiReboot,
	apiSyncDeviceTime,
	apiSendFloodAdvert,
	apiSendZeroHopAdvert,
	apiGetContacts
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

// http api methods

async function apiReboot(params) {

	console.log("apiReboot", params);

	try {
		await connection.reboot();
		return { message: "Device reboot command sent" };
	} catch (error) {
		console.log("apiReboot failed", error);
		return { message: "Device reboot failed", error: error?.message || String(error) };
	}
}

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

async function apiSendFloodAdvert(params) {

	console.log("apiSendFloodAdvert", params);

	try {
		await connection.sendFloodAdvert();
		return { message: "Flood advert sent" };
	} catch (error) {
		console.log("apiSendFloodAdvert failed", error);
		return { message: "Flood advert failed", error: error?.message || String(error) };
	}
}

async function apiSendZeroHopAdvert(params) {

	console.log("apiSendZeroHopAdvert", params);

	try {
		await connection.sendZeroHopAdvert();
		return { message: "Zero-hop advert sent" };
	} catch (error) {
		console.log("apiSendZeroHopAdvert failed", error);
		return { message: "Zero-hop advert failed", error: error?.message || String(error) };
	}
}

async function apiGetContacts(params) {

	console.log("apiGetContacts", params);

	try {
		const contactsRaw = await connection.getContacts();
		const contacts = contactsRaw.map((contact) => {

			const publicKey = helpers.bytesToHex(contact.publicKey);
			const outPath = helpers.bytesToHex(contact.outPath, contact.outPathLen > 0 ? contact.outPathLen : undefined);
			const type = helpers.constantKey(Constants.AdvType, contact.type).toLowerCase();
			const lastAdvert = helpers.formatDateTime(contact.lastAdvert);
			const lastMod = helpers.formatDateTime(contact.lastMod);

			// coords in 1e-6 degrees
			const lat = contact.advLat != null ? (contact.advLat / 1e6).toFixed(6) : "";
			const lon = contact.advLon != null ? (contact.advLon / 1e6).toFixed(6) : "";

			// exclude source keys
			const {
				outPath: _omitOutPath,
				outPathLen: _omitOutPathLen,
				flags: _omitFlags,
				...rest
			} = contact;

			return {
				...rest,
				publicKey,
				//outPath,
				type,
				lastAdvert,
				lastMod,
				advLat: lat,
				advLon: lon
			};
		});

		return { contacts };
	} catch (error) {
		console.log("apiGetContacts failed", error);
		return { message: "Contacts retrieval failed", error: error?.message || String(error) };
	}
}

// wait on device connection
connection.on("connected", async () => {

	selfInfo = await connection.getSelfInfo();
	selfInfo.advType = helpers.constantKey(Constants.AdvType, selfInfo.type).toLowerCase();

	console.log(selfInfo.name + " (" + selfInfo.advType + ") connected on " + meshcoreDevice);

	// update device clock
	await connection.syncDeviceTime();

	// send flood advert
	// await connection.sendFloodAdvert();
});

// wait on device disconnection
connection.on("disconnected", async () => {

	console.log(selfInfo.name + " (" + selfInfo.advType + ") disconnected from " + meshcoreDevice);

	// reconnect if RECONNECT_DELAY present
	if (reconnectDelay) helpers.wait(reconnectDelay).then(connectDevice);
});

// wait on incoming messages
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

// contact message received
async function onContactMessageReceived(message) {

	// get contact name by prefix
	const contact = await connection.findContactByPublicKeyPrefix(message.pubKeyPrefix);
	const contactName = contact.advName;

	console.log("Received contact message", contactName, message);

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

	console.log("Received channel message", channelName, message);
}

// (re)connect to device
async function connectDevice() {

	try {
		await connection.connect();
	} catch (error) {
		console.log(error.message);

		// reconnect if RECONNECT_DELAY present
		if (reconnectDelay) return helpers.wait(reconnectDelay).then(connectDevice);
		// or exit gracefully
		else return;
	}
}

await connectDevice();
