#!/usr/bin/env node

import express from "express";
import type { Request, Response } from "express";

import { AtpAgent } from "@atproto/api";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";
import { handleToolCall, tools } from "./tools/index.js";

async function main() {
	const app = express();
	const transports: { [sessionId: string]: SSEServerTransport } = {};

	const identifier = process.env.BLUESKY_USERNAME;
	const password = process.env.BLUESKY_PASSWORD;
	const service = process.env.BLUESKY_PDS_URL || "https://bsky.social";

	if (!identifier || !password) {
		console.error(
			"Please set BLUESKY_USERNAME and BLUESKY_PASSWORD environment variables",
		);
		process.exit(1);
	}

	const agent = new AtpAgent({ service });
	const loginResponse = await agent.login({
		identifier,
		password,
	});
	if (!loginResponse.success) {
		console.error("Failed to login to Bluesky");
		process.exit(1);
	}

	const server = new Server(
		{
			name: "Bluesky MCP Server",
			version: "1.2.23",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools,
		};
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			console.log(name);
			return handleToolCall(name, agent, args);
		} catch (error) {
			if (error instanceof z.ZodError) {
				throw new Error(
					`Invalid arguments: ${error.errors
						.map((e) => `${e.path.join(".")}: ${e.message}`)
						.join(", ")}`,
				);
			}

			throw error;
		}
	});


	app.get("/sse", async (req: Request, res: Response) => {
		// Get the full URI from the request
		const host = req.get("host");

		const fullUri = `https://${host}/bluesky`;
		const transport = new SSEServerTransport(fullUri, res);

		transports[transport.sessionId] = transport;
		res.on("close", () => {
			delete transports[transport.sessionId];
		});
		await server.connect(transport);
	});

	app.post("/bluesky", async (req: Request, res: Response) => {
	const sessionId = req.query.sessionId as string;
	//const transport = transports[sessionId];
	const transport = transports[Object.keys(transports)[0]];
	if (transport) {
		console.log("gouding to calll transpront")
		await transport.handlePostMessage(req, res);
	} else {
		res.status(400).send("No transport found for sessionId");
	}
	});

	const PORT = process.env.PORT || 3001;


	app.get("/", (_req, res) => {
		res.send("The bluesky MCP server is running!");
	});
	app.listen(PORT, () => {
		  console.log(`✅ Server is running at http://localhost:${PORT}`);
});

}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
