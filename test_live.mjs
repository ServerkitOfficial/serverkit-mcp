import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'live-test', version: '0.0.1' });
const transport = new StdioClientTransport({ command: 'node', args: ['src/index.js'] });
await client.connect(transport);

console.log('--- discover_servers (expected: empty, phone has no responder yet) ---');
const discover = await client.callTool({ name: 'discover_servers', arguments: {} });
console.log(JSON.stringify(discover.content, null, 2));

console.log('--- connect to known URL directly ---');
const conn = await client.callTool({
  name: 'connect',
  arguments: { url: 'http://192.168.0.152:8081/mcp' },
});
console.log(JSON.stringify(conn, null, 2));

console.log('--- start_session ---');
const start = await client.callTool({ name: 'start_session', arguments: { pin: '1111' } });
console.log(JSON.stringify(start, null, 2));

console.log('--- run_command ---');
const run = await client.callTool({
  name: 'run_command',
  arguments: { command: 'echo hello-from-node-mcp-client' },
});
console.log(JSON.stringify(run, null, 2));

console.log('--- download_file (this package.json) ---');
const dl = await client.callTool({
  name: 'download_file',
  arguments: { remote_path: '/etc/hostname', local_path: 'C:/Users/Jui/Desktop/server_tools/serverkit-mcp/tmp_hostname' },
});
console.log(JSON.stringify(dl, null, 2));

console.log('--- end_session ---');
const end = await client.callTool({ name: 'end_session', arguments: {} });
console.log(JSON.stringify(end, null, 2));

await client.close();
console.log('DONE');
