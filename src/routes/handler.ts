import { getSandbox, proxyToSandbox } from '@cloudflare/sandbox';
import type { Sandbox } from '@cloudflare/sandbox';
import {
  createOpenhandsServer,
  proxyToOpenhands,
  type OpenhandsOptions,
  type OpenhandsServer,
} from '../openhands';
import { DEFAULT_AGENT_SERVER_PATH } from '../utils/agent-server';

// Cloudflare Workers environment type constraint
// Accepts any Env type that has a Sandbox property compatible with DurableObjectNamespace
// This is a minimal structural type that matches what getSandbox and proxyToSandbox need
// Using a more permissive type that accepts any object with the required structure
export type OpenhandsEnv = {
  Sandbox: {
    get(id: { toString(): string }): {
      fetch(input: string | Request, init?: RequestInit): Promise<Response>;
    };
  };
};

/**
 * Options for OpenHands route handler
 */
export interface OpenhandsHandlerOptions extends OpenhandsOptions {
  /** Base path for OpenHands routes (default: '') */
  basePath?: string;
  /** Custom sandbox name resolver */
  getSandboxName?: (request: Request) => string | null;
}

/**
 * Find existing OpenHands server by port
 */
async function findOpenhandsServer(
  sandbox: Sandbox<unknown>,
  port: number
): Promise<OpenhandsServer | null> {
  const processes = await sandbox.listProcesses();

  for (const process of processes) {
    // Match agent-server processes on the specified port
    if (
      process.command.includes(DEFAULT_AGENT_SERVER_PATH) &&
      (process.command.includes(`--port ${port}`) ||
        process.command.includes(`--port=${port}`)) &&
      (process.status === 'running' || process.status === 'starting')
    ) {
      // Try to get exposed ports to find preview URL
      let previewUrl: string | undefined;
      try {
        // Try to get exposed ports - hostname is optional
        const exposedPorts = await sandbox.getExposedPorts('');
        const exposed = exposedPorts.find((p) => p.port === port);
        if (exposed) {
          previewUrl = exposed.url;
        }
      } catch {
        // Ignore errors getting exposed ports
      }

      return {
        port,
        url: `http://localhost:${port}`,
        previewUrl,
        processId: process.id,
        async close() {
          await process.kill('SIGTERM');
        },
      };
    }
  }

  return null;
}

/**
 * Creates a middleware function that handles OpenHands routes.
 * Returns null if the request doesn't match OpenHands routes (allows chaining).
 *
 * @param options - Configuration options
 * @returns Middleware function
 */
export function createOpenhandsHandler<Env extends OpenhandsEnv = OpenhandsEnv>(
  options: OpenhandsHandlerOptions = {}
) {
  const basePath = options.basePath || '';
  const getSandboxName = options.getSandboxName || ((req) => {
    const url = new URL(req.url);
    return url.searchParams.get('sandbox');
  });

  return async (
    request: Request,
    env: Env
  ): Promise<Response | null> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Extract sandbox name
    const sandboxName = getSandboxName(request) || options.sandboxName || 'my-sandbox';
    const sandbox = getSandbox(env.Sandbox, sandboxName);

    // Handle preview URL proxying (must be first)
    const proxyResponse = await proxyToSandbox(request, env);
    if (proxyResponse) {
      return proxyResponse;
    }

    // Handle OpenHands routes
    if (pathname === `${basePath}/start-openhands`) {
      try {
        // Extract hostname from request if not provided
        const hostname = options.hostname || url.hostname;

        const server = await createOpenhandsServer(sandbox, {
          ...options,
          hostname: options.exposePort ? hostname : undefined,
        });

        return Response.json({
          process: {
            id: server.processId,
            port: server.port,
            status: 'running',
          },
          previewUrl: server.previewUrl
            ? { url: server.previewUrl, port: server.port }
            : undefined,
          success: true,
        });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            success: false,
          },
          { status: 500 }
        );
      }
    }

    if (pathname === `${basePath}/stop-openhands`) {
      try {
        const port = options.port ?? 8001;
        const server = await findOpenhandsServer(sandbox, port);
        if (server) {
          await server.close();
          return Response.json({ success: true, message: 'Server stopped' });
        }
        return Response.json(
          { success: false, message: 'No server running' },
          { status: 404 }
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : String(error),
            success: false,
          },
          { status: 500 }
        );
      }
    }

    if (pathname === `${basePath}/openhands-status`) {
      try {
        const port = options.port ?? 8001;
        const server = await findOpenhandsServer(sandbox, port);
        if (!server) {
          return Response.json({
            running: false,
            success: true,
          });
        }

        // Verify process is still running
        const processes = await sandbox.listProcesses();
        const process = processes.find((p) => p.id === server.processId);

        return Response.json({
          running: process?.status === 'running',
          port: server.port,
          previewUrl: server.previewUrl,
          process: process
            ? {
                id: process.id,
                status: process.status,
                command: process.command,
              }
            : null,
          success: true,
        });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : String(error),
            success: false,
          },
          { status: 500 }
        );
      }
    }

    // Request doesn't match OpenHands routes
    return null;
  };
}

/**
 * Attaches OpenHands routes to an existing fetch handler.
 * This wraps your handler with OpenHands route handling and preview URL proxying.
 *
 * @param fetchHandler - Your existing fetch handler
 * @param options - Configuration options
 * @returns Wrapped fetch handler
 *
 * @example
 * ```typescript
 * import { attachOpenhandsRoutes } from 'openhands-sdk/routes';
 *
 * export default attachOpenhandsRoutes(async (request, env) => {
 *   // Your custom routes here
 *   return new Response('Not found', { status: 404 });
 * }, {
 *   port: 8001,
 *   exposePort: true,
 *   hostname: 'yourdomain.com'
 * });
 * ```
 */
export function attachOpenhandsRoutes<Env extends OpenhandsEnv = OpenhandsEnv>(
  fetchHandler: (
    request: Request,
    env: Env
  ) => Response | Promise<Response>,
  options: OpenhandsHandlerOptions = {}
): (
  request: Request,
  env: Env
) => Promise<Response> {
  const openhandsHandler = createOpenhandsHandler<Env>(options);

  return async (
    request: Request,
    env: Env
  ): Promise<Response> => {
    // First, try OpenHands handler
    const openhandsResponse = await openhandsHandler(request, env);
    if (openhandsResponse !== null) {
      return openhandsResponse;
    }

    // Fall through to user's handler
    return fetchHandler(request, env);
  };
}

