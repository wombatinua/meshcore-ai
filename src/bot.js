import { queryAiGate } from "./aigate.js";
import { wait } from "./helpers.js";

const parseChannelIds = (value) => new Set(
	(String(value || "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map(Number)
		.filter((n) => Number.isFinite(n)))
);

let botName = null;
const allowedChannels = parseChannelIds(process.env.BOT_CHANNELS);
const translateFromChannels = parseChannelIds(process.env.AI_TRANSLATE_FROM);
const translateToChannel = (() => {
	const n = Number(process.env.AI_TRANSLATE_TO);
	return Number.isFinite(n) ? n : null;
})();

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
			// forward translation when configured, regardless of bot mention
			try {
				const translationResult = await translateChannelMessage({
					sourceChannelIdx: channelIdx,
					advName,
					text,
					destinationChannelIdx: translateToChannel,
					connection
				});
				if (translationResult?.message) {
					console.log("translateChannelMessage notice", translationResult);
				}
			} catch (error) {
				console.log("nudgeBot translateChannelMessage failed", error);
			}

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

// translate a channel message via AI and forward to a destination channel
export async function translateChannelMessage({
	sourceChannelIdx,
	advName,
	text,
	destinationChannelIdx,
	connection
}) {

	const messageLimit = 135;
	const src = Number(sourceChannelIdx);
	if (!Number.isFinite(src) || !translateFromChannels.has(src)) return null;

	const dest = Number(destinationChannelIdx ?? translateToChannel);
	if (!Number.isFinite(dest)) return { message: "Missing destination channel id" };
	if (!connection) return { message: "Missing connection" };

	const rawText = (text || "").trim();
	if (!rawText) return { message: "Missing text" };

	try {
		// compute how many characters AI can use (reserve space for "advName: ")
		const budget = Math.max(0, messageLimit - ((advName?.length || "Unknown".length) + 2));

		const { text: translated } = await queryAiGate({
			userPrompt: rawText,
			systemPrompt: `Return only the Latvian—English translation. If not translatable, return as is. Max ${budget} chars.`,
			maxTokens: 40
		});

		const translatedClean = (translated || "").trim();
		if (!translatedClean) return { message: "Translation empty" };

		const namePart = advName || "Unknown";

		// hard cap to protect downstream limits
		const capped = translatedClean.slice(0, budget);
		const payload = `${namePart}: ${capped}`.slice(0, messageLimit);

		// small pause before forwarding to avoid hammering
		await wait(10000);
		await connection.sendChannelTextMessage(dest, payload);

		return { channelIdx: dest, text: payload };
	} catch (error) {
		console.log("translateChannelMessage failed", error);
		return { message: "Translation failed", error: error?.message || String(error) };
	}
}
