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
	apiDate,
	apiTime
};

// start http server
const httpServer = new HttpServer({
	port: httpPort,
	host: httpHost,
	apiPath: httpApi,
	root: "http",
	actions: actionHandlers
}); await httpServer.start();

// http api methods

async function apiDate(params) {

	console.log("apiDate", params);

	const now = new Date();
	const date = now.toLocaleDateString("de-DE", { // gives dd.mm.yyyy
		day: "2-digit",
		month: "2-digit",
		year: "numeric"
	});

	return { message: date, params: params ?? null };
}

async function apiTime(params) {

	console.log("apiTime", params);

	const now = new Date();
	const time = now.toLocaleTimeString("en-GB", { // gives HH:MM:SS
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false
	});

	return { message: time, params: params ?? null };
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
