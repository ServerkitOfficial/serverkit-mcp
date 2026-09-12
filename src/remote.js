import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

/** Holds the single active connection to a ServerKit phone's MCP server. */
class RemoteConnection {
  #client = null;
  #transport = null;
  #url = null;

  get connected() {
    return this.#client !== null;
  }

  get url() {
    return this.#url;
  }

  async connect(url) {
    if (this.#client) {
      await this.disconnect();
    }
    try {
      await this.#connectOnce(url);
    } catch (err) {
      // mcp_dart's StreamableHTTPServerTransport only supports ONE
      // `initialize` per instance for its whole lifetime - if a previous
      // client vanished without a graceful disconnect (closed terminal,
      // killed process), the phone is stuck refusing every reconnect with
      // "Server already initialized", forever, even from a brand-new
      // client. /mcp/reset (outside the MCP/JSON-RPC layer, so it's
      // reachable even while /mcp itself is stuck) tears down and rebuilds
      // that transport. Try it once, transparently, before giving up.
      await this.#resetServer(url);
      await this.#connectOnce(url);
    }
  }

  async #connectOnce(url) {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const client = new Client({ name: 'serverkit-mcp', version: '0.1.0' });
    await client.connect(transport);
    this.#client = client;
    this.#transport = transport;
    this.#url = url;
  }

  async #resetServer(url) {
    const resetUrl = url.replace(/\/mcp\/?$/, '/mcp/reset');
    const res = await fetch(resetUrl, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Server reset failed: HTTP ${res.status}`);
    }
  }

  async disconnect() {
    if (!this.#client) return;
    try {
      await this.#transport?.terminateSession?.();
    } catch {
      // server may not have issued a session id - fine
    }
    await this.#client.close();
    this.#client = null;
    this.#transport = null;
    this.#url = null;
  }

  /**
   * Forwards a tool call to the connected phone. Never throws - a tool the
   * phone never registered (e.g. run_command_sudo when sudo tools are off)
   * is a protocol-level failure in the SDK, so it's caught here and turned
   * into an ordinary isError result instead of crashing this proxy.
   */
  async callTool(name, args) {
    if (!this.#client) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Not connected to a ServerKit server. Call connect first (use discover_servers to find one, or ask the user for its ip:port).',
          },
        ],
      };
    }
    try {
      return await this.#client.callTool({ name, arguments: args });
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Remote call failed: ${err?.message ?? err}` }],
      };
    }
  }
}

export const remote = new RemoteConnection();
