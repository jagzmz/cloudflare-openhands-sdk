# OpenHands Example for Cloudflare Workers

This example demonstrates how to run the [OpenHands](https://github.com/All-Hands-AI/OpenHands) AI agent inside a Cloudflare Worker using the [cloudflare-openhands-sdk](https://github.com/jagzmz/cloudflare-openhands-sdk). OpenHands is an autonomous AI coding agent that can execute code, analyze files, and answer complex questions.

## What's Included

This example provides a simple `/ask` endpoint where you can send questions or requests to the OpenHands agent running in a Cloudflare Sandbox container. The agent uses Claude Sonnet 4.5 to process your requests and return responses.

Note that this endpoint is a basic request/response endpoint and does not support multi-turn conversation. 

Check out the OpenHands documentation for more details on how to create a multi-turn conversation by sending messages to a conversation: https://docs.openhands.dev/sdk/guides/agent-server/api-reference/events/send-message

## Prerequisites

Before getting started, you'll need:

- **Cloudflare Workers Paid Account** - Required for Durable Objects and Container support
- **Anthropic API Key** - Get one from [Anthropic Console](https://console.anthropic.com/)
- **Node.js** - Version 18 or higher

## Quick Start

Create a new project using this template:

```bash
npm create cloudflare@latest -- openhands-example --template=jagzmz/cloudflare-openhands-sdk/examples/openhands
```

## Setup & Configuration

### Local Development

Copy the example environment file and add your Anthropic API key:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and add your `ANTHROPIC_API_KEY`:

```
ANTHROPIC_API_KEY=your-api-key-here
```

### Deployment

For production deployment, add the API key as a secret:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

When prompted, enter your Anthropic API key.

## Development

Start the local development server:

```bash
npm run dev
```

Test the endpoint:

```bash
curl --get --data-urlencode "message=Amaze me with a profound and awe-inspiring stoic poem that echoes through the ages." "http://localhost:8787/ask"
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

After deployment, the container image will be built and pushed to the Cloudflare registry. **Wait for the image to be provisioned** before making requests. You can check the provisioning status in the [Cloudflare Dashboard](https://dash.cloudflare.com/).

## Usage

Once deployed or running locally, you can interact with your AI agent:

```bash
# Set the base URL
export BASE_URL=https://<your-domain>.workers.dev  # OR http://localhost:8787 for local

# 🚀 Make a request to your AI agent!

# Example using cURL. The message can be anything you like:
MESSAGE="Amaze me with a profound and awe-inspiring stoic poem that echoes through the ages. Max 2 paragraphs."

curl --get --data-urlencode "message=$MESSAGE" "$BASE_URL/ask"

# Tip: Edit the MESSAGE variable above to test different prompts.
# The server will return a response with the AI's answer.
```

## Learn More

- [cloudflare-openhands-sdk](https://github.com/jagzmz/cloudflare-openhands-sdk) - Main SDK documentation
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) - The autonomous AI coding agent
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Cloudflare Workers documentation
