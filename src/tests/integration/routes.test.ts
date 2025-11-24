import { describe, expect, it, spyOn, mock, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { createApp } from '../../app';
import * as v1Builder from '../../services/settingsBuilder';
import * as v2Builder from '../../services/comapeocatBuilder';

const app = createApp();

afterEach(() => {
  mock.restore();
});

async function createTempFile(contents: string) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comapeo-test-'));
  const filePath = path.join(tmpDir, 'out.comapeocat');
  await fs.writeFile(filePath, contents);
  return filePath;
}

describe('API routes', () => {
  it('returns built file from /v1', async () => {
    const filePath = await createTempFile('v1-data');
    spyOn(v1Builder, 'buildSettingsV1').mockResolvedValue(filePath);

    const form = new FormData();
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'config.zip', { type: 'application/zip' }));

    const res = await app.handle(
      new Request('http://localhost/v1', {
        method: 'POST',
        body: form,
      })
    );

    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.toString()).toBe('v1-data');
  });

  it('returns built file from /v2', async () => {
    const filePath = await createTempFile('v2-data');
    spyOn(v2Builder, 'buildComapeoCatV2').mockResolvedValue({ outputPath: filePath, fileName: 'out.comapeocat' });

    const payload = {
      metadata: { name: 'test', version: '1.0.0' },
      categories: [
        { id: 'cat-1', name: 'Cat', appliesTo: ['observation', 'track'], tags: { categoryId: 'cat-1' }, fields: ['field-1'], track: true },
      ],
      fields: [
        { id: 'field-1', name: 'Field', tagKey: 'field-1', type: 'text' },
      ],
    };

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.toString()).toBe('v2-data');
  });

  it('returns 400 for /v2 with invalid Content-Type', async () => {
    const payload = {
      metadata: { name: 'test' },
      categories: [],
      fields: [],
    };

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('Content-Type must be application/json');
  });

  it('returns 400 for /v2 with oversized body', async () => {
    const largePayload = { data: 'x'.repeat(2_000_000) }; // 2MB > 1MB limit

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(JSON.stringify(largePayload)).toString()
        },
        body: JSON.stringify(largePayload),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('Request body too large');
  });
});
