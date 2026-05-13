#!/usr/bin/env node
// Builds craftcontrol-pack.zip from src/ and writes SHA1 to dist/craftcontrol-pack.zip.sha1
import archiver from 'archiver';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const outZip = path.join(distDir, 'craftcontrol-pack.zip');
const outSha1 = outZip + '.sha1';

fs.mkdirSync(distDir, { recursive: true });

const output = fs.createWriteStream(outZip);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const bytes = fs.readFileSync(outZip);
  const sha1 = crypto.createHash('sha1').update(bytes).digest('hex');
  fs.writeFileSync(outSha1, sha1);
  console.log(`Built: ${outZip}`);
  console.log(`Size:  ${(archive.pointer() / 1024).toFixed(1)} KB`);
  console.log(`SHA1:  ${sha1}`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(srcDir, false);
archive.finalize();
