import * as helpers from "./helpers.js";
import Constants from "meshcore.js/src/constants.js";
import NodeJSSerialConnection from "meshcore.js/src/connection/nodejs_serial_connection.js";

const meshcoreDevice = process.env.MESHCORE_DEVICE;
const connection = new NodeJSSerialConnection(meshcoreDevice);

let selfInfo = {};

// wait on connection
connection.on("connected", async () => {

	selfInfo = await connection.getSelfInfo();
	selfInfo.advType = helpers.constantKey(Constants.AdvType, selfInfo.type).toLowerCase();

	console.log(selfInfo.name + " (" + selfInfo.advType + ") connected on " + meshcoreDevice);

	// update device clock
	await connection.syncDeviceTime();

	// send flood advert
	// await connection.sendFloodAdvert();
});

// listen for new messages
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

async function onChannelMessageReceived(message) {

	// get channel name by id
	const channelInfo = await connection.getChannel(message.channelIdx);
	const channelName = channelInfo.name;

	console.log("Received channel message", channelName, message);
}

// connect to meshcore device
await connection.connect();