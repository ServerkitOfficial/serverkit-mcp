# serverkit-mcp

Stdio MCP server that proxies a [ServerKit](https://github.com/ServerkitOfficial) phone's
in-app MCP server (SSH command execution) to any MCP-capable agent - Claude Code, Codex,
or anything else that can run a local MCP server over stdio.

## Why this exists

The phone's own MCP server is Streamable HTTP, reachable at `http://<phone-ip>:<port>/mcp`.
That's fine for a client that supports remote HTTP connectors directly (Claude Desktop,
claude.ai), but a CLI agent normally needs that URL registered up front, and the phone's
IP/port isn't stable across sessions. This package sits in between as a stdio MCP server:
it can broadcast on the LAN to find the phone automatically, or take a URL you give it, then
forwards tool calls to it for the rest of the conversation - no config file edit each time.

## Tools

- `discover_servers` - UDP-broadcasts on the LAN, returns any ServerKit phones that answer
  (`{ name, url }[]`). Empty result is normal, not an error - the phone-side responder for
  this doesn't exist yet as of this writing, so expect empty until that ships.
- `connect(url)` - connects to a phone's MCP server (from discovery, or an ip:port the user
  gives you directly).
- `disconnect()` - closes the connection.
- `start_session(pin?)`, `end_session()`, `run_command(command, cwd?)`,
  `run_command_sudo(command, cwd?)` - forwarded 1:1 to the phone's own tools. See
  `ssh_server_manager/lib/features/mcp_server/data/mcp_tools.dart` in the main app repo for
  what these actually do server-side; keep this file's tool list in sync with that one.

## Install

```bash
npm install
```

## Register with an agent

```bash
claude mcp add --transport stdio serverkit -- node /path/to/serverkit-mcp/src/index.js
```

This is a one-time setup step (unlike the phone's raw-HTTP prompt, which has no persistent
registration). After that, in any session: ask the agent to discover or connect, then use
the SSH tools normally.

## Discovery protocol

Self-defined, no external dependency. UDP port `41234`.

- Request (broadcast to `255.255.255.255:41234`): `{"type":"serverkit-discover","v":1}`
- Response (unicast back to sender): `{"type":"serverkit-announce","v":1,"name":"<device>","url":"http://<ip>:<port>/mcp"}`

The phone side (Flutter app) doesn't implement the responder yet - this client's discovery
will find nothing until it does. `connect(url)` with a manually-provided URL works today.
