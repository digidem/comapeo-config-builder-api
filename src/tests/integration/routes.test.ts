import { describe, expect, it, spyOn, mock, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { createApp } from '../../app';
import * as v1Builder from '../../services/settingsBuilder';
import * as v2Builder from '../../services/comapeocatBuilder';
import { Reader } from 'comapeocat';
import { config } from '../../config/app';

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
    // We no longer mock buildComapeoCatV2 so that the real comapeocat validation can occur.
    // The buildComapeoCatV2 service itself handles temporary file creation and cleanup.

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
    // Further assertions can be added here if needed to check the content of the returned file,
    // though for this test, simply verifying success and valid output is sufficient.
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.byteLength).toBeGreaterThan(0); // Expect a non-empty file
  });

  it('returns 422 when comapeocat validation hangs', async () => {
    const payload = {
      metadata: { name: 'timeout-test', version: '1.0.0' },
      categories: [
        { id: 'cat-1', name: 'Cat', appliesTo: ['observation', 'track'], fields: ['field-1'], track: true },
      ],
      fields: [
        { id: 'field-1', name: 'Field', tagKey: 'field-1', type: 'text' },
      ],
    };

    const originalTimeout = config.validationTimeoutMs;
    const validateSpy = spyOn(Reader.prototype, 'validate').mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    let res: Response | null = null;
    try {
      config.validationTimeoutMs = 50;

      res = await app.handle(
        new Request('http://localhost/v2', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );
    } finally {
      config.validationTimeoutMs = originalTimeout;
    }

    const body = await res!.json();
    expect(res?.status).toBe(422);
    expect(body.error).toBe('ProcessingError');
    expect(body.message).toContain('timed out');
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
    const largePayload = { data: 'x'.repeat(11_000_000) }; // 11MB > 10MB limit

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

  it('returns 400 for /v2 with oversized body WITHOUT Content-Length header', async () => {
    // This test demonstrates the vulnerability: when Content-Length is omitted,
    // the current implementation allows the body to be fully parsed into memory
    // before validation runs, enabling DoS attacks via chunked encoding
    const largePayload = { data: 'x'.repeat(11_000_000) }; // 11MB > 10MB limit

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // NO Content-Length header - simulates chunked transfer encoding
        },
        body: JSON.stringify(largePayload),
      })
    );

    // Should still reject oversized bodies even without Content-Length
    // Currently, Layer 2 validation catches this AFTER parsing (not ideal for DoS protection)
    // After fix, Layer 1 should reject DURING parsing
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    // Accept either message - Layer 1 (during parse) or Layer 2 (after parse)
    expect(body.message).toMatch(/too large|exceeds.*bytes/i);
  });

  it('enforces size limit with content-type including charset parameter', async () => {
    // This test exposes the security vulnerability: content-type with charset
    // bypasses the streaming validation, allowing large payloads to be buffered
    const largePayload = { data: 'x'.repeat(11_000_000) }; // 11MB > 10MB limit

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(JSON.stringify(largePayload)).toString()
        },
        body: JSON.stringify(largePayload),
      })
    );

    // Should reject during streaming validation (not after full buffering)
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('Request body too large');
  });

  it('prevents path traversal in /v2 endpoint', async () => {
    const payload = {
      metadata: { name: '../tmp/evil', version: '../../etc/passwd' },
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

    // Request should be rejected to prevent path traversal attacks
    // This prevents malicious intent from being hidden in logs/debugging
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('path separators');
  });

  it('returns 400 for /v2 when fields is an object instead of array', async () => {
    const payload = {
      metadata: { name: 'test', version: '1.0.0' },
      categories: [
        { id: 'cat-1', name: 'Cat', appliesTo: ['observation'], fields: ['field-1'] },
      ],
      fields: {}, // Invalid: object instead of array
    };

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('At least one field is required');
  });

  it('returns 400 for /v2 when fields is a string instead of array', async () => {
    const payload = {
      metadata: { name: 'test', version: '1.0.0' },
      categories: [
        { id: 'cat-1', name: 'Cat', appliesTo: ['observation'], fields: ['field-1'] },
      ],
      fields: 'invalid', // Invalid: string instead of array
    };

    const res = await app.handle(
      new Request('http://localhost/v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('ValidationError');
    expect(body.message).toContain('At least one field is required');
  });
});
