import * as helpers from "./helpers.js";

// in-memory contacts cache to avoid repeated device reads
const contactCache = {
	byKey: new Map(),
	byName: new Map()
};

// store/refresh a single contact in both lookup maps
export function cacheContact(contact) {

	if (!contact?.publicKey) return;

	const publicKeyHex = helpers.bytesToHex(contact.publicKey);
	if (!publicKeyHex) return;

	contactCache.byKey.set(publicKeyHex, contact);

	if (contact.advName) {
		contactCache.byName.set(contact.advName, { ...contact, publicKeyHex });
	}
}

// batch insert/update contacts
export function cacheContacts(contacts = []) {
	contacts.forEach(cacheContact);
}

// quick check for cached entries
export function hasCachedContacts() {
	return contactCache.byKey.size > 0;
}

// return all cached contacts
export function getCachedContacts() {
	return Array.from(contactCache.byKey.values());
}

// resolve by full public key (hex lookup)
export function getCachedContactByPublicKey(publicKeyBytes) {

	if (!publicKeyBytes) return null;

	const publicKeyHex = helpers.bytesToHex(publicKeyBytes);
	const cached = contactCache.byKey.get(publicKeyHex);
	return cached ? { ...cached, publicKeyHex } : null;
}

// resolve by public key prefix (linear scan of cache)
export function getCachedContactByPrefix(prefixBytes) {

	if (!prefixBytes) return null;

	const prefixHex = helpers.bytesToHex(prefixBytes);
	for (const [keyHex, contact] of contactCache.byKey.entries()) {
		if (keyHex.startsWith(prefixHex)) return { ...contact, publicKeyHex: keyHex };
	}
	return null;
}

// resolve contact by advert name (cache first, device fallback)
export async function resolveContactByAdvName(advName, connection) {

	if (!advName) return null;

	const cached = contactCache.byName.get(advName);
	if (cached) return cached;

	if (!connection) return null;

	const contacts = await connection.getContacts();
	cacheContacts(contacts);
	return contactCache.byName.get(advName) || null;
}
