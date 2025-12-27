import { Sandbox } from "@cloudflare/sandbox";
import { OpenhandsServer, proxyToOpenhands } from "cloudflare-openhands-sdk";
import { env } from "cloudflare:workers";

const DEFAULT_CONVERSATION_ID = "7f5866f5-d500-4bce-869c-2a5da18f8e1a";

interface AgentConfig {
  model: string;
  apiKey: string;
  temperature: number;
  workingDir: string;
}

export class AskRequestHandler {
  private conversationId: string;
  private agentConfig: AgentConfig;

  constructor(
    private sandbox: Sandbox,
    private server: OpenhandsServer,
    conversationId: string = DEFAULT_CONVERSATION_ID
  ) {
    this.conversationId = conversationId;
    this.agentConfig = {
      model: "anthropic/claude-sonnet-4-5-20250929",
      apiKey: env.ANTHROPIC_API_KEY,
      temperature: 1,
      workingDir: "workspace/project",
    };
  }

  static isAskRequest(request: Request): boolean {
    const isAskPath = request.url.includes("/ask");
    if (!isAskPath && request.method === "GET") return false;
    return true;
  }

  async handle(request: Request): Promise<string> {
    const message = this.extractMessage(request);
    await this.ensureConversation();
    const response = await this.askAgent(message);
    return response;
  }

  private extractMessage(request: Request): string {
    const url = new URL(request.url);
    const message = url.searchParams.get("message");
    if (!message) {
      throw new Error("Message is required");
    }
    return message;
  }

  private async ensureConversation(): Promise<void> {
    const url = new URL(`${this.server.url}/api/conversations`);
    const request = new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_id: this.conversationId,
        agent: {
          llm: {
            model: this.agentConfig.model,
            api_key: this.agentConfig.apiKey,
            temperature: this.agentConfig.temperature,
            usage_id: "openhands-sandbox",
          },
          system_prompt_kwargs: {
            llm_security_analyzer: true,
          },
        },
        workspace: {
          working_dir: this.agentConfig.workingDir,
        },
      }),
    });

    const response = await proxyToOpenhands(request, this.sandbox, this.server);
    if (!response.ok) {
      throw new Error("Failed to ensure conversation");
    }
  }

  private async askAgent(message: string): Promise<string> {
    const url = new URL(
      `${this.server.url}/api/conversations/${this.conversationId}/ask_agent`
    );
    const request = new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: message,
      }),
    });

    const response = await proxyToOpenhands(request, this.sandbox, this.server);

    if (!response.ok) {
      throw new Error("Failed to send message");
    }

    const responseJson = (await response.json()) as { response: string };
    if (!responseJson.response) {
      throw new Error("No response from agent");
    }

    return responseJson.response;
  }
}
