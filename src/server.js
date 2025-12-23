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

	constructor({ port, host = "0.0.0.0", root = "http", staticDir, apiPath = "/api", sampleFunction }) {

		this.port = port;
		this.host = host;
		this.apiPath = apiPath;
		this.staticDir = staticDir || path.join(__dirname, root);
		this.sampleFunction = sampleFunction || (async () => ({ message: "sampleFunction executed" }));
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

			if (req.method === "GET") return await this.serveStatic(req, res, requestUrl);
			if (req.method === "POST") {

				if (requestUrl.pathname === this.apiPath) return await this.handleAction(req, res);

				res.writeHead(404, { "Content-Type": "application/json" });
				return res.end(JSON.stringify({ ok: false, error: "Not Found" }));
			}

			res.writeHead(405, { "Content-Type": "text/plain" });
			res.end("Method Not Allowed");
		} catch (error) {

			console.error("HTTP server error:", error);
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Internal Server Error");
		}
	}

	async serveStatic(req, res, requestUrl) {

		requestUrl = requestUrl || new URL(req.url, `http://${req.headers.host}`);
		const normalizedPath = path.normalize(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
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
			res.writeHead(400, { "Content-Type": "application/json" });
			return res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
		}

		if (payload.action !== "sampleFunction") {

			res.writeHead(400, { "Content-Type": "application/json" });
			return res.end(JSON.stringify({ ok: false, error: "Unknown action" }));
		}

		const result = await this.sampleFunction(payload);

		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: true, result }));
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

			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("Internal Server Error");
		});

		stream.pipe(res);
	}
}
