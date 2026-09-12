import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// The MCP client's own URL is .../mcp - the raw file-transfer route lives
// alongside it at .../file (see mcp_file_transfer.dart on the phone side).
// Deliberately outside the MCP/JSON-RPC layer: bytes never travel as
// base64-in-JSON, and never land in the calling agent's context - only a
// short "downloaded N bytes" summary does.
function fileEndpoint(mcpUrl, remotePath) {
  const base = mcpUrl.replace(/\/mcp\/?$/, '/mcp/file');
  return `${base}?path=${encodeURIComponent(remotePath)}`;
}

/** Streams the remote file straight to disk. Returns the byte count. */
export async function downloadFile(mcpUrl, remotePath, localPath) {
  const res = await fetch(fileEndpoint(mcpUrl, remotePath));
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Download failed: HTTP ${res.status} ${body}`);
  }
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(localPath));
  const { size } = await fs.promises.stat(localPath);
  return size;
}

/** Reads the local file and POSTs it to the phone for SFTP write. */
export async function uploadFile(mcpUrl, localPath, remotePath) {
  const buf = await fs.promises.readFile(localPath);
  const res = await fetch(fileEndpoint(mcpUrl, remotePath), {
    method: 'POST',
    body: buf,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Upload failed: HTTP ${res.status} ${body}`);
  }
  const json = await res.json().catch(() => ({}));
  return json.bytes ?? buf.length;
}
