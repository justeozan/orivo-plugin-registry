#!/usr/bin/env node
// Verify the published envelope the way Orivo will: signature first (over the
// domain-tagged document), then the document's own grammar. Exits non-zero on
// the first class of failure Orivo distinguishes.
//
//   node scripts/verify.mjs                 verify index.v1.json
//   node scripts/verify.mjs --public-key <base64|pem-file>
//   node scripts/verify.mjs <file>

import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { SIGNING_CONTEXT, validateDocument } from './lib.mjs';

const HERE = import.meta.dirname;
const DEFAULT_ENVELOPE = path.resolve(HERE, '..', 'index.v1.json');
const DEFAULT_PUBLIC_KEY = path.resolve(HERE, '..', 'keys', 'orivo-release.pub.b64');

function fail(message) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
let file = DEFAULT_ENVELOPE;
let publicKeyArgument = DEFAULT_PUBLIC_KEY;

for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--public-key') publicKeyArgument = argv[++index];
  else file = path.resolve(argv[index]);
}

if (!existsSync(file)) fail(`no such file: ${file}`);

const envelope = JSON.parse(readFileSync(file, 'utf8'));
if (envelope.formatVersion !== 1) fail('formatVersion must be 1');
if (typeof envelope.document !== 'string') fail('document must be a string');
if (typeof envelope.signature !== 'string') fail('signature must be a base64 string');

const signature = Buffer.from(envelope.signature, 'base64');
if (signature.length !== 64) fail(`signature must decode to 64 bytes, got ${signature.length}`);

let publicKey;
if (existsSync(publicKeyArgument)) {
  const contents = readFileSync(publicKeyArgument, 'utf8');
  publicKey = contents.includes('BEGIN')
    ? createPublicKey(contents)
    : createPublicKey({
        key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(contents.trim(), 'base64').toString('base64url') },
        format: 'jwk',
      });
} else {
  publicKey = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKeyArgument.trim(), 'base64').toString('base64url') },
    format: 'jwk',
  });
}

const digest = createHash('sha256').update(SIGNING_CONTEXT).update(envelope.document, 'utf8').digest();
if (!verify(null, digest, publicKey, signature)) {
  fail('signature does not verify over sha256(context || document)');
}
console.log('ok    signature verifies over the domain-tagged document');

const document = JSON.parse(envelope.document);
const problems = validateDocument(document, Date.now());
if (problems.length > 0) {
  console.error('FAIL  the document would be refused by Orivo:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log('ok    document satisfies the index grammar');
console.log(`ok    sequence ${document.sequence}, expires ${new Date(document.expiresAtEpochMs).toISOString()}`);
for (const entry of document.plugins) {
  console.log(`ok    ${entry.id} ${entry.version} -> ${entry.url}`);
}
console.log(`\n${'index.v1.json'} is valid.\n`);
