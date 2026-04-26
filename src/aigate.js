// Example:
// const { text } = await queryAiGate({
// 	userPrompt: "Summarize this message",
// 	systemPrompt: "You are MeshCore assistant.",
// 	model: "gpt-5.4-mini",
// 	endpoint: process.env.AI_API,
// 	apiKey: process.env.AI_API_KEY,
// 	temperature: 0.3,
// 	max_completion_tokens: 128
// });

// Lightweight helper for calling an OpenAI-compatible chat endpoint
export async function queryAiGate({
	endpoint,
	apiKey,
	model,
	systemPrompt,
	userPrompt = "",
	temperature,
	max_completion_tokens,
	headers = {},
	signal
} = {}) {

	// helper: parse numeric env/params safely
	const parseNumber = (value) => {
		const n = Number(value);
		return Number.isFinite(n) ? n : undefined;
	};
	const pick = (value, fallback) => (value ?? fallback);

	// defaults from environment with sensible fallbacks
	const envConfig = {
		endpoint: process.env.AI_API || "https://api.openai.com/v1/chat/completions",
		apiKey: process.env.AI_API_KEY,
		model: process.env.AI_MODEL || "gpt-5.4-mini",
		systemPrompt: process.env.AI_SYSTEM_PROMPT || "",
		temperature: parseNumber(process.env.AI_TEMPERATURE),
		max_completion_tokens: parseNumber(process.env.AI_MAX_COMPLETION_TOKENS)
	};

	// params override env defaults
	const resolved = {
		endpoint: pick(endpoint, envConfig.endpoint),
		apiKey: pick(apiKey, envConfig.apiKey),
		model: pick(model, envConfig.model),
		systemPrompt: pick(systemPrompt, envConfig.systemPrompt),
		temperature: pick(temperature, envConfig.temperature),
		max_completion_tokens: pick(max_completion_tokens, envConfig.max_completion_tokens)
	};

	// minimal validation
	if (!resolved.endpoint) throw new Error("Missing endpoint");
	if (!resolved.model) throw new Error("Missing model");
	if (!userPrompt) throw new Error("Missing user prompt");

	// compose OpenAI-compatible messages payload
	const messages = [
		...(resolved.systemPrompt ? [{ role: "system", content: resolved.systemPrompt }] : []),
		{ role: "user", content: userPrompt }
	];

	// assemble request payload
	const payload = {
		model: resolved.model,
		messages,
		...(typeof resolved.temperature === "number" ? { temperature: resolved.temperature } : {}),
		...(typeof resolved.max_completion_tokens === "number" ? { max_completion_tokens: resolved.max_completion_tokens } : {})
	};

	// execute request
	const response = await fetch(resolved.endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(resolved.apiKey ? { Authorization: `Bearer ${resolved.apiKey}` } : {}),
			...headers
		},
		body: JSON.stringify(payload),
		signal
	});

	const data = await response.json().catch(() => null);
	// bubble up API error messages if present
	if (!response.ok) {
		throw new Error(data?.error?.message || data?.error || response.statusText || "Request failed");
	}

	return {
		text: data?.choices?.[0]?.message?.content?.trim() || "",
		raw: data
	};
}
