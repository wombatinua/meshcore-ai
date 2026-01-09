import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";
import { stat } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mimeTypes = {
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".ico": "image/x-icon"
};

const httpCodes = {
	"400": {
		invalidJson: "Invalid JSON",
		missingAction: "Missing action",
		unknownAction: "Unknown action"
	},
	"403": "Forbidden",
	"404": "Not Found",
	"405": "Method Not Allowed",
	"500": "Internal Server Error"
};

export default class HttpServer {

	// initialize http server with static and api routes
	constructor({ port = 8080, host = "localhost", root = "http", staticDir, apiPath = "/api", actions = {} } = {}) {

		this.port = port;
		this.host = host;
		this.apiPath = apiPath;
		this.staticDir = staticDir || path.join(__dirname, root);
		this.actions = actions;
		this.server = null;
	}

	// start listening
	async start() {

		if (this.server) return this.server;

		return new Promise((resolve, reject) => {

			this.server = http.createServer((req, res) => this.handleRequest(req, res));

			this.server.on("error", reject);
			this.server.listen(this.port, this.host, () => {

				console.log(`HTTP server listening on ${this.host}:${this.port}`);
				resolve(this.server);
			});
		});
	}

	// basic router: POST -> api, GET -> static
	async handleRequest(req, res) {

		const requestUrl = new URL(req.url, `http://${req.headers.host}`);

		try {

			// lightweight health endpoint
			if (req.method === "GET" && requestUrl.pathname === "/health") return this.text(res, 200, "ok");

			// POST
			if (req.method === "POST") {

				// only accept POSTs on the api path
				if (requestUrl.pathname !== this.apiPath) return this.json(res, 404, { ok: false, error: httpCodes["404"] });
				return this.handleAction(req, res);
			}

			// GET
			if (req.method === "GET") return this.serveStatic(res, requestUrl.pathname);

			// other methods
			return this.text(res, 405, httpCodes["405"]);

		} catch (error) {

			console.error("HTTP server error:", error);
			return this.text(res, 500, httpCodes["500"]);
		}
	}

	// serve static files under configured root
	async serveStatic(res, pathname = "/") {

		const normalizedPath = path.normalize(pathname === "/" ? "/index.html" : pathname);
		// drop any ../ attempts to escape the static root
		const safePath = normalizedPath.replace(/^(\.\.[/\\])+/g, "");
		const filePath = path.join(this.staticDir, safePath);

		let fileStat;

		try {
			fileStat = await stat(filePath);
		} catch {
			res.writeHead(404, { "Content-Type": "text/plain" });
			return res.end(httpCodes["404"]);
		}

		if (fileStat.isDirectory()) {

			const indexPath = path.join(filePath, "index.html");

			try {
				// serve index.html when hitting a directory
				await stat(indexPath);
				return this.streamFile(indexPath, res);
			} catch {
				res.writeHead(403, { "Content-Type": "text/plain" });
				return res.end(httpCodes["403"]);
			}
		}

		return this.streamFile(filePath, res);
	}

	// dispatch an API action from the action map
	async handleAction(req, res) {

		const body = await this.readRequestBody(req);
		let payload = {};

		try {
			payload = JSON.parse(body || "{}");
		} catch {
			return this.json(res, 400, { ok: false, error: httpCodes["400"].invalidJson });
		}

		const { action, params } = payload;

		if (!action) {

			return this.json(res, 400, { ok: false, error: httpCodes["400"].missingAction });
		}

		const handler = this.actions[action];

		if (typeof handler !== "function") {

			return this.json(res, 400, { ok: false, error: httpCodes["400"].unknownAction });
		}

		let parsedParams = params;

		if (typeof params === "string") {

			try {
				// allow params to be JSON stringified in the request
				parsedParams = JSON.parse(params);
			} catch {
				parsedParams = params;
			}
		}

		const result = await handler(parsedParams);

		return this.json(res, 200, { ok: true, result });
	}

	// collect request body
	async readRequestBody(req) {

		const chunks = [];

		// async iterator collects body buffers
		for await (const chunk of req) chunks.push(chunk);

		return Buffer.concat(chunks).toString();
	}

	// stream file with basic error handling
	streamFile(filePath, res) {

		const ext = path.extname(filePath).toLowerCase();
		const contentType = mimeTypes[ext] || "application/octet-stream";

		res.writeHead(200, { "Content-Type": contentType });
		const stream = createReadStream(filePath);

		stream.on("error", () => {

			this.text(res, 500, httpCodes["500"]);
		});

		stream.pipe(res);
	}

	// helper: JSON response
	json(res, statusCode, payload) {

		res.writeHead(statusCode, { "Content-Type": "application/json" });
		res.end(JSON.stringify(payload));
	}

	// helper: plain text response
	text(res, statusCode, payload) {

		res.writeHead(statusCode, { "Content-Type": "text/plain" });
		res.end(payload);
	}
}
