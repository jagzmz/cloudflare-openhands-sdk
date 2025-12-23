import type { Sandbox, Process } from '@cloudflare/sandbox';
import type {
  OpenhandsOptions,
  OpenhandsServer,
  OpenhandsStartupContext,
} from './types';
import { OpenhandsStartupError } from './types';
import {
  buildAgentServerCommand,
  DEFAULT_AGENT_SERVER_DIR,
  DEFAULT_AGENT_SERVER_PATH,
} from '../utils/agent-server';

const DEFAULT_PORT = 8001;

/**
 * Find an existing agent-server process running on the specified port.
 * Returns the process if found and still active, null otherwise.
 */
async function findExistingAgentServer(
  sandbox: Sandbox<unknown>,
  port: number
): Promise<Process | null> {
  const processes = await sandbox.listProcesses();
  const commandPattern = DEFAULT_AGENT_SERVER_PATH;

  for (const proc of processes) {
    // Match commands that contain the agent-server path
    if (proc.command.includes(commandPattern)) {
      // Check if the command includes the port
      if (
        proc.command.includes(`--port ${port}`) ||
        proc.command.includes(`--port=${port}`)
      ) {
        if (proc.status === 'starting' || proc.status === 'running') {
          return proc;
        }
      }
    }
  }

  return null;
}

/**
 * Start a new agent-server process
 */
async function startAgentServer(
  sandbox: Sandbox<unknown>,
  port: number,
  options: OpenhandsOptions
): Promise<Process> {
  const directory = options.directory || DEFAULT_AGENT_SERVER_DIR;
  const command = buildAgentServerCommand(port, directory);

  const process = await sandbox.startProcess(command, {
    cwd: directory,
    env: options.env,
  });

  // Wait for the server to be ready
  try {
    await process.waitForPort(port, {
      mode: 'http',
      path: '/',
      timeout: 60_000, // 60 seconds
    });
  } catch (e) {
    const logs = await process.getLogs();
    throw new OpenhandsStartupError(
      `agent-server failed to start on port ${port}. Stderr: ${logs.stderr || '(empty)'}`,
      {
        port,
        stderr: logs.stderr,
        command: process.command,
        processId: process.id,
      },
      { cause: e }
    );
  }

  return process;
}

/**
 * Ensures agent-server is running in the container.
 * Reuses existing process if one is already running on the specified port.
 * Handles concurrent startup attempts gracefully by retrying on failure.
 */
async function ensureAgentServer(
  sandbox: Sandbox<unknown>,
  port: number,
  options: OpenhandsOptions
): Promise<Process> {
  // Check if agent-server is already running on this port
  const existingProcess = await findExistingAgentServer(sandbox, port);
  if (existingProcess) {
    // Reuse existing process - wait for it to be ready if still starting
    if (existingProcess.status === 'starting') {
      try {
        await existingProcess.waitForPort(port, {
          mode: 'http',
          path: '/',
          timeout: 60_000,
        });
      } catch (e) {
        const logs = await existingProcess.getLogs();
        throw new OpenhandsStartupError(
          `agent-server failed to start. Stderr: ${logs.stderr || '(empty)'}`,
          {
            port,
            stderr: logs.stderr,
            command: existingProcess.command,
            processId: existingProcess.id,
          },
          { cause: e }
        );
      }
    }
    return existingProcess;
  }

  // Try to start a new agent-server
  try {
    return await startAgentServer(sandbox, port, options);
  } catch (startupError) {
    // Startup failed - check if another concurrent request started the server
    // This handles the race condition where multiple requests try to start simultaneously
    const retryProcess = await findExistingAgentServer(sandbox, port);
    if (retryProcess) {
      // Wait for the concurrent server to be ready
      if (retryProcess.status === 'starting') {
        try {
          await retryProcess.waitForPort(port, {
            mode: 'http',
            path: '/',
            timeout: 60_000,
          });
        } catch (e) {
          const logs = await retryProcess.getLogs();
          throw new OpenhandsStartupError(
            `agent-server failed to start. Stderr: ${logs.stderr || '(empty)'}`,
            {
              port,
              stderr: logs.stderr,
              command: retryProcess.command,
              processId: retryProcess.id,
            },
            { cause: e }
          );
        }
      }
      return retryProcess;
    }

    // No concurrent process found, rethrow the original error
    throw startupError;
  }
}

/**
 * Starts an agent-server inside a Sandbox container.
 *
 * This function manages the server lifecycle only. If an agent-server is already
 * running on the specified port, this function will reuse it instead of starting
 * a new one.
 *
 * @param sandbox - The Sandbox instance to run agent-server in
 * @param options - Configuration options
 * @returns Promise resolving to server handle { port, url, previewUrl?, close() }
 *
 * @example
 * ```typescript
 * import { getSandbox } from '@cloudflare/sandbox'
 * import { createOpenhandsServer } from 'openhands-sdk/openhands'
 *
 * const sandbox = getSandbox(env.Sandbox, 'my-sandbox')
 * const server = await createOpenhandsServer(sandbox, {
 *   port: 8001,
 *   exposePort: true,
 *   hostname: 'yourdomain.com'
 * })
 *
 * // Proxy requests to the server
 * return sandbox.containerFetch(request, server.port)
 *
 * // When done
 * await server.close()
 * ```
 */
export async function createOpenhandsServer(
  sandbox: Sandbox<unknown>,
  options: OpenhandsOptions = {}
): Promise<OpenhandsServer> {
  const port = options.port ?? DEFAULT_PORT;
  const process = await ensureAgentServer(sandbox, port, options);

  let previewUrl: string | undefined;

  // Optionally expose port for preview URL
  if (options.exposePort) {
    if (!options.hostname) {
      throw new Error(
        'hostname is required when exposePort is true. Provide hostname in options or extract from request URL.'
      );
    }

    try {
      const exposed = await sandbox.exposePort(port, {
        hostname: options.hostname,
      });
      previewUrl = typeof exposed === 'string' ? exposed : exposed.url;
    } catch (error) {
      // Log but don't fail - server is still running
      console.warn('Failed to expose port:', error);
    }
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

/**
 * Proxy a request to the agent-server.
 *
 * This function handles proxying only - you must start the server separately
 * using `createOpenhandsServer()`.
 *
 * @param request - The incoming HTTP request
 * @param sandbox - The Sandbox instance running agent-server
 * @param server - The agent-server handle from createOpenhandsServer()
 * @returns Response from agent-server
 *
 * @example
 * ```typescript
 * import { getSandbox } from '@cloudflare/sandbox'
 * import { createOpenhandsServer, proxyToOpenhands } from 'openhands-sdk/openhands'
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const sandbox = getSandbox(env.Sandbox, 'my-sandbox')
 *     const server = await createOpenhandsServer(sandbox, {
 *       port: 8001,
 *       exposePort: true,
 *       hostname: 'yourdomain.com'
 *     })
 *     return proxyToOpenhands(request, sandbox, server)
 *   }
 * }
 * ```
 */
export function proxyToOpenhands(
  request: Request,
  sandbox: Sandbox<unknown>,
  server: OpenhandsServer
): Response | Promise<Response> {
  return sandbox.containerFetch(request, server.port);
}

