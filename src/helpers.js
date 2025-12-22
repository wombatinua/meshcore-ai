// return key name from meshcore constants map by id

export function constantKey(map, id, fallback = "Unknown") {
	return Object.keys(map).find(k => map[k] === id) || fallback;
}
