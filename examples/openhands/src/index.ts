import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import {
  createOpenhandsServer,
  proxyToOpenhands,
} from "cloudflare-openhands-sdk";
import { AskRequestHandler } from "./askRequest";

export { Sandbox } from "@cloudflare/sandbox";

const SANDBOX_NAME = "openhands";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const sandbox = getSandbox(env.Sandbox, SANDBOX_NAME);
    const server = await createOpenhandsServer(sandbox, {
      sandboxName: SANDBOX_NAME,
    });

    if (AskRequestHandler.isAskRequest(request)) {
      try {
        const handler = new AskRequestHandler(sandbox, server);
        const response = await handler.handle(request);
        return new Response(response, {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error(error);
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    return proxyToOpenhands(request, sandbox, server);
  },
};
