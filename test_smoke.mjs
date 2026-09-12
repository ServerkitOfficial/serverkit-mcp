import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'smoke-test', version: '0.0.1' });
const transport = new StdioClientTransport({ command: 'node', args: ['src/index.js'] });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name));

const discover = await client.callTool({ name: 'discover_servers', arguments: {} });
console.log('discover_servers result:', JSON.stringify(discover.content));

const notConnected = await client.callTool({ name: 'run_command', arguments: { command: 'echo hi' } });
console.log('run_command without connect:', JSON.stringify(notConnected));

await client.close();
console.log('OK');
