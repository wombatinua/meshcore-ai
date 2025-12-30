let botName = null;

export function setBotName(name) {
	botName = name || null;
}

// detect if bot is mentioned via @[botName] anywhere in the text
function isBotMentioned(text) {

	if (!botName || !text) return false;

	const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const mentionRegex = new RegExp(`@\\[?${escapedName}\\]?`, "i");
	return mentionRegex.test(text);
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
			// only engage bot when explicitly mentioned
			if (isBotMentioned(text)) {
				return handleChannelMessage({ advName, text, publicKey, channelIdx, channelName, senderTimestamp });
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

async function handleChannelMessage({ advName, text, publicKey, channelIdx, channelName, senderTimestamp }) {

	console.log("nudgeBot channel path", { botName, advName, text, publicKey, channelIdx, channelName, senderTimestamp });
}

async function handleAdvert({ advName, publicKey, type, lastAdvert, lastMod, advLat, advLon }) {
	
	console.log("nudgeBot advert path", { botName, advName, publicKey, type, lastAdvert, lastMod, advLat, advLon });
}
