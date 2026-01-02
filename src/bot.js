import { queryAiGate } from "./aigate.js";

let botName = null;
const allowedChannels = new Set(
	(String(process.env.BOT_CHANNELS || "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map(Number)
		.filter((n) => Number.isFinite(n)))
);

export function setBotName(name) {
	botName = name || null;
}

// detect if bot is mentioned via @BotName or @[BotName] anywhere in the text
function isBotMentioned(text) {

	if (!botName || !text) return false;

	const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const mentionRegex = new RegExp(`@\\[?${escapedName}\\]?`, "i");
	return mentionRegex.test(text);
}

// detect if channel is allowed via BOT_CHANNELS env
function isAllowedChannel(channelIdx) {

	if (channelIdx == null) return false;
	return allowedChannels.has(Number(channelIdx));
}

// bot entry point for reacting to different message sources
export async function nudgeBot({
	source,
	advName = null,
	text = null,
	publicKey = null,
	channelIdx = null,
	channelName = null,
	senderTimestamp = null,
	connection = null,
	type = null,
	lastAdvert = null,
	lastMod = null,
	advLat = null,
	advLon = null
}) {

	switch (source) {

		case "contact":
			return handleContactMessage({ advName, text, publicKey, senderTimestamp });

		case "channel":
			// engage only on allowed channels and when explicitly mentioned
			if (isAllowedChannel(channelIdx) && isBotMentioned(text)) {
				return handleChannelMessage({ advName, text, publicKey, channelIdx, channelName, senderTimestamp, connection });
			}
			return null;

		case "advert":
			return handleAdvert({ advName, publicKey, type, lastAdvert, lastMod, advLat, advLon });
			
		default:
			console.log("nudgeBot: unknown source", source, { advName, text, publicKey });
			return null;
	}
}

async function handleContactMessage({ advName, text, publicKey, senderTimestamp }) {

	console.log("nudgeBot contact path", { botName, advName, text, publicKey, senderTimestamp });
}

async function handleChannelMessage({ advName, text, publicKey, channelIdx, channelName, senderTimestamp, connection }) {

	console.log("nudgeBot channel path", { botName, advName, text, publicKey, channelIdx, channelName, senderTimestamp });

	const replyText = `@[${advName || "friend"}] you said: ${text}`;
	console.log("nudgeBot channel reply", replyText);

	try {
		await connection.sendChannelTextMessage(channelIdx, replyText);
	} catch (error) {
		console.log("nudgeBot: failed to send channel reply", error);
	}

	return replyText;
}

async function handleAdvert({ advName, publicKey, type, lastAdvert, lastMod, advLat, advLon }) {
	
	console.log("nudgeBot advert path", { botName, advName, publicKey, type, lastAdvert, lastMod, advLat, advLon });
}
