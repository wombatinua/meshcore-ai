// return key name from meshcore constants map by id
export function constantKey(map, id, fallback = "Unknown") {
	return Object.keys(map).find(k => map[k] === id) || fallback;
}

// non-blocking delay
// await wait(5000);
export function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// convert a byte-like object (Uint8Array or plain number map) to hex string
export function bytesToHex(byteLike, length) {

	if (!byteLike) return "";

	const values = Array.isArray(byteLike) ? byteLike : Object.values(byteLike);
	// clamp to provided length if given
	const slice = typeof length === "number" && length > 0 ? values.slice(0, length) : values;

	return Buffer.from(slice).toString("hex");
}

// format epoch seconds to DD.MM.YYYY HH:MM:SS
export function formatDateTime(seconds) {

	if (!seconds && seconds !== 0) return "";

	const date = new Date(seconds * 1000);
	const pad = (n) => String(n).padStart(2, "0");

	const day = pad(date.getDate());
	const month = pad(date.getMonth() + 1);
	const year = date.getFullYear();
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	const secs = pad(date.getSeconds());

	return `${day}.${month}.${year} ${hours}:${minutes}:${secs}`;
}
