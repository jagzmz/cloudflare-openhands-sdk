import type { Sandbox } from '@cloudflare/sandbox';

/**
 * Default path to agent-server executable
 */
export const DEFAULT_AGENT_SERVER_PATH =
  '/container-server/software-agent-sdk/.venv/bin/agent-server';

/**
 * Default working directory for agent-server
 */
export const DEFAULT_AGENT_SERVER_DIR =
  '/container-server/software-agent-sdk';

/**
 * Get the default agent-server executable path
 */
export function getDefaultAgentServerPath(): string {
  return DEFAULT_AGENT_SERVER_PATH;
}

/**
 * Get the default agent-server working directory
 */
export function getDefaultAgentServerDir(): string {
  return DEFAULT_AGENT_SERVER_DIR;
}

/**
 * Check if agent-server exists at the given path
 */
export async function checkAgentServerExists(
  sandbox: Sandbox<unknown>,
  path: string = DEFAULT_AGENT_SERVER_PATH
): Promise<boolean> {
  try {
    const result = await sandbox.exec(
      `test -f ${path} && echo "EXISTS" || echo "NOT_FOUND"`
    );
    return result.stdout.trim() === 'EXISTS';
  } catch {
    return false;
  }
}

/**
 * Find agent-server executable by checking common locations
 */
export async function findAgentServerPath(
  sandbox: Sandbox<unknown>
): Promise<string | null> {
  const locations = [
    DEFAULT_AGENT_SERVER_PATH,
    '/software-agent-sdk/.venv/bin/agent-server',
    '/root/software-agent-sdk/.venv/bin/agent-server',
  ];

  for (const location of locations) {
    if (await checkAgentServerExists(sandbox, location)) {
      return location;
    }
  }

  // Try which as fallback
  try {
    const result = await sandbox.exec('which agent-server');
    const path = result.stdout.trim();
    if (path && !path.includes('not found')) {
      return path;
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Build the agent-server command
 */
export function buildAgentServerCommand(
  port: number,
  directory?: string
): string {
  const command = `${DEFAULT_AGENT_SERVER_PATH} --host 0.0.0.0 --port ${port}`;
  return directory && directory !== DEFAULT_AGENT_SERVER_DIR
    ? `cd ${directory} && ${command}`
    : command;
}

