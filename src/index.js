#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

import { discoverServers } from './discovery.js';
import { downloadFile, uploadFile } from './fileTransfer.js';
import { remote } from './remote.js';

const server = new McpServer({ name: 'serverkit-mcp', version: '0.1.0' });

server.registerTool(
  'discover_servers',
  {
    description:
      'Broadcast on the local network to find ServerKit phones running the MCP server. ' +
      'Returns a list of { name, url }. If it comes back empty, no phone answered - ' +
      'ask the user for the ip:port shown in their ServerKit app instead of retrying.',
    inputSchema: z.object({}),
  },
  async () => {
    const found = await discoverServers();
    return {
      content: [
        {
          type: 'text',
          text: found.length
            ? JSON.stringify(found)
            : 'No ServerKit servers found on this network. Ask the user for the ip:port shown in their ServerKit app, then call connect with that URL.',
        },
      ],
    };
  },
);

server.registerTool(
  'connect',
  {
    description:
      'Connect to a ServerKit MCP server at the given URL (e.g. from discover_servers, ' +
      'or an ip:port the user gave you - format it as http://<ip>:<port>/mcp). ' +
      'Call this before start_session/run_command.',
    inputSchema: z.object({
      url: z.string().describe('e.g. http://192.168.1.42:8080/mcp'),
    }),
  },
  async ({ url }) => {
    try {
      await remote.connect(url);
      return { content: [{ type: 'text', text: `Connected to ${url}.` }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to connect: ${err?.message ?? err}` }],
      };
    }
  },
);

server.registerTool(
  'disconnect',
  {
    description: 'Disconnect from the current ServerKit server.',
    inputSchema: z.object({}),
  },
  async () => {
    await remote.disconnect();
    return { content: [{ type: 'text', text: 'Disconnected.' }] };
  },
);

// The remaining tools are a thin, 1:1 forward of the phone's own MCP tools -
// see ssh_server_manager/lib/features/mcp_server/data/mcp_tools.dart. Keep
// names/args in sync with that file if it changes.

server.registerTool(
  'start_session',
  {
    description:
      'Start a tool-use session on the connected ServerKit server. Must be called ' +
      'once before run_command/run_command_sudo will do anything. If the server ' +
      'replies that a PIN is required, ask the user for it and call this again ' +
      'with the pin argument.',
    inputSchema: z.object({ pin: z.string().optional() }),
  },
  async (args) => remote.callTool('start_session', args),
);

server.registerTool(
  'end_session',
  {
    description: 'End the current tool-use session on the connected ServerKit server.',
    inputSchema: z.object({}),
  },
  async () => remote.callTool('end_session', {}),
);

server.registerTool(
  'run_command',
  {
    description:
      'Run a shell command on the server ServerKit is connected to over SSH. ' +
      'Requires start_session first. Blocked if the command invokes sudo/doas/su/pkexec.',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
    }),
  },
  async (args) => remote.callTool('run_command', args),
);

server.registerTool(
  'run_command_sudo',
  {
    description:
      'Run a shell command with sudo permitted. Only works if the phone owner enabled ' +
      'sudo tools in the app - if it errors as unknown, that tool is disabled there.',
    inputSchema: z.object({
      command: z.string(),
      cwd: z.string().optional(),
    }),
  },
  async (args) => remote.callTool('run_command_sudo', args),
);

server.registerTool(
  'cancel_command',
  {
    description:
      'Cancel the command currently running via run_command or run_command_sudo, if any. ' +
      'Closes its SSH channel - a foreground command dies with it, but a backgrounded/' +
      'nohup\'d process can keep running on the server regardless.',
    inputSchema: z.object({}),
  },
  async () => remote.callTool('cancel_command', {}),
);

// These two are NOT 1:1 forwards like the tools above - only this Node
// process has real desktop filesystem access, so the actual byte-moving
// happens here (fileTransfer.js), against the phone's raw /file route, not
// through a phone-side MCP tool. The agent's tool result is a short byte
// count, never the file content itself.

server.registerTool(
  'download_file',
  {
    description:
      'Copy a file FROM the connected server to a local path on this desktop, so you ' +
      'can work on it with your own file tools (read, edit, grep). Streams directly to ' +
      'disk - the file content never appears in this conversation, only a byte count does. ' +
      'Use this ONLY when you need the file\'s full content. For a quick look - the last ' +
      'N lines, a grep match, a line count - use run_command with tail/head/grep/wc ' +
      'instead, it\'s far cheaper and doesn\'t leave a copy on disk.',
    inputSchema: z.object({
      remote_path: z.string().describe('Path on the connected server'),
      local_path: z.string().describe('Path on this desktop to write the file to'),
    }),
  },
  async ({ remote_path, local_path }) => {
    if (!remote.connected) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Not connected to a ServerKit server. Call connect first.' }],
      };
    }
    try {
      const bytes = await downloadFile(remote.url, remote_path, local_path);
      return { content: [{ type: 'text', text: `Downloaded ${bytes} bytes to ${local_path}` }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Download failed: ${err?.message ?? err}` }],
      };
    }
  },
);

server.registerTool(
  'upload_file',
  {
    description:
      'Copy a local file from this desktop TO the connected server. Reads the whole file ' +
      'and writes it over SFTP - the content never appears in this conversation, only a ' +
      'byte count does. Use this for real files (binaries, configs you edited locally, ' +
      'archives) - for a small text change, run_command with a heredoc or `echo >` is ' +
      'usually simpler than round-tripping through a local file.',
    inputSchema: z.object({
      local_path: z.string().describe('Path on this desktop to read the file from'),
      remote_path: z.string().describe('Path on the connected server to write to'),
    }),
  },
  async ({ local_path, remote_path }) => {
    if (!remote.connected) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Not connected to a ServerKit server. Call connect first.' }],
      };
    }
    try {
      const bytes = await uploadFile(remote.url, local_path, remote_path);
      return { content: [{ type: 'text', text: `Uploaded ${bytes} bytes to ${remote_path}` }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Upload failed: ${err?.message ?? err}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
