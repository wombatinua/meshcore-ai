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

export default class HttpServer {

	constructor({ port = 8080, host = "localhost", root = "http", staticDir, apiPath = "/api", actions = {} } = {}) {

		this.port = port;
		this.host = host;
		this.apiPath = apiPath;
		this.staticDir = staticDir || path.join(__dirname, root);
		this.actions = actions;
		this.server = null;
	}

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

	async handleRequest(req, res) {

		const requestUrl = new URL(req.url, `http://${req.headers.host}`);

		try {

			if (req.method === "POST") {

				if (requestUrl.pathname !== this.apiPath) return this.json(res, 404, { ok: false, error: "Not Found" });
				return await this.handleAction(req, res);
			}

			if (req.method === "GET") return await this.serveStatic(res, requestUrl.pathname);

			return this.text(res, 405, "Method Not Allowed");
		} catch (error) {

			console.error("HTTP server error:", error);
			return this.text(res, 500, "Internal Server Error");
		}
	}

	async serveStatic(res, pathname = "/") {

		const normalizedPath = path.normalize(pathname === "/" ? "/index.html" : pathname);
		const safePath = normalizedPath.replace(/^(\.\.[/\\])+/g, "");
		const filePath = path.join(this.staticDir, safePath);

		let fileStat;

		try {
			fileStat = await stat(filePath);
		} catch {
			res.writeHead(404, { "Content-Type": "text/plain" });
			return res.end("Not Found");
		}

		if (fileStat.isDirectory()) {

			const indexPath = path.join(filePath, "index.html");

			try {
				await stat(indexPath);
				return this.streamFile(indexPath, res);
			} catch {
				res.writeHead(403, { "Content-Type": "text/plain" });
				return res.end("Forbidden");
			}
		}

		return this.streamFile(filePath, res);
	}

	async handleAction(req, res) {

		const body = await this.readRequestBody(req);
		let payload = {};

		try {
			payload = JSON.parse(body || "{}");
		} catch {
			return this.json(res, 400, { ok: false, error: "Invalid JSON" });
		}

		const { action, params } = payload;

		if (!action) {

			return this.json(res, 400, { ok: false, error: "Missing action" });
		}

		const handler = this.actions[action];

		if (typeof handler !== "function") {

			return this.json(res, 400, { ok: false, error: "Unknown action" });
		}

		let parsedParams = params;

		if (typeof params === "string") {

			try {
				parsedParams = JSON.parse(params);
			} catch {
				parsedParams = params;
			}
		}

		const result = await handler(parsedParams);

		return this.json(res, 200, { ok: true, result });
	}

	async readRequestBody(req) {

		const chunks = [];

		for await (const chunk of req) chunks.push(chunk);

		return Buffer.concat(chunks).toString();
	}

	streamFile(filePath, res) {

		const ext = path.extname(filePath).toLowerCase();
		const contentType = mimeTypes[ext] || "application/octet-stream";

		res.writeHead(200, { "Content-Type": contentType });
		const stream = createReadStream(filePath);

		stream.on("error", () => {

			this.text(res, 500, "Internal Server Error");
		});

		stream.pipe(res);
	}

	json(res, statusCode, payload) {

		res.writeHead(statusCode, { "Content-Type": "application/json" });
		res.end(JSON.stringify(payload));
	}

	text(res, statusCode, payload) {

		res.writeHead(statusCode, { "Content-Type": "text/plain" });
		res.end(payload);
	}
}
