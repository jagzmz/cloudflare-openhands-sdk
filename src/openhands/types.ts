import type { Process } from '@cloudflare/sandbox';

/**
 * Configuration options for starting OpenHands agent-server
 */
export interface OpenhandsOptions {
  /** Port for agent-server (default: 8001) */
  port?: number;
  /** Working directory for agent-server (default: /container-server/software-agent-sdk) */
  directory?: string;
  /** Hostname for preview URL exposure (required if exposePort is true) */
  hostname?: string;
  /** Enable preview URL exposure (default: false) */
  exposePort?: boolean;
  /** Environment variables for agent-server */
  env?: Record<string, string>;
  /** Sandbox name/session ID (default: 'my-sandbox') */
  sandboxName?: string;
}

/**
 * Server lifecycle management
 */
export interface OpenhandsServer {
  /** Port the server is running on */
  port: number;
  /** Base URL for server (http://localhost:{port}) */
  url: string;
  /** Preview URL if port was exposed (optional) */
  previewUrl?: string;
  /** Process ID */
  processId: string;
  /** Close the server gracefully */
  close(): Promise<void>;
}

/**
 * Context information for startup errors
 */
export interface OpenhandsStartupContext {
  port: number;
  stderr?: string;
  command?: string;
  processId?: string;
}

/**
 * Error thrown when agent-server fails to start
 */
export class OpenhandsStartupError extends Error {
  readonly code = 'OPENHANDS_STARTUP_FAILED' as const;
  readonly context: OpenhandsStartupContext;

  constructor(
    message: string,
    context: OpenhandsStartupContext,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'OpenhandsStartupError';
    this.context = context;
  }
}

