import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'bigfile-test', version: '0.0.1' });
const transport = new StdioClientTransport({ command: 'node', args: ['src/index.js'] });
await client.connect(transport);

async function call(name, arguments_) {
  const r = await client.callTool({ name, arguments: arguments_ });
  console.log(`--- ${name} ---`);
  console.log(JSON.stringify(r, null, 2));
  return r;
}

await call('connect', { url: 'http://192.168.0.152:8081/mcp' });
await call('start_session', { pin: '1111' });

console.log('--- run_command: create 1MB remote file + sha256 ---');
await call('run_command', { command: 'head -c 1048576 /dev/urandom > /tmp/big_test_download.bin && sha256sum /tmp/big_test_download.bin' });

console.log('--- download_file ---');
await call('download_file', {
  remote_path: '/tmp/big_test_download.bin',
  local_path: 'C:/Users/Jui/Desktop/server_tools/serverkit-mcp/big_test_download.bin',
});

console.log('--- upload_file ---');
await call('upload_file', {
  local_path: 'C:/Users/Jui/Desktop/server_tools/serverkit-mcp/big_test_upload.bin',
  remote_path: '/tmp/big_test_upload.bin',
});

console.log('--- run_command: sha256 of uploaded remote file ---');
await call('run_command', { command: 'sha256sum /tmp/big_test_upload.bin' });

await call('end_session', {});
await client.close();
console.log('DONE');
