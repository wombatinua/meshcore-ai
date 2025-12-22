// return key name from meshcore constants map by id

export function constantKey(map, id, fallback = "Unknown") {
	return Object.keys(map).find(k => map[k] === id) || fallback;
}

// non-blockin delay
// await wait(5000);

export function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
