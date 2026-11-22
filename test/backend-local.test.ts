import { describe, expect, it } from 'vitest';
import { localOnlyMessage } from '../lib/backend/contract';
import { createLocalBackend } from '../lib/backend/local';

describe('local backend', () => {
  const backend = createLocalBackend();

  it('advertises itself as local-only', () => {
    expect(backend.kind).toBe('local');
    expect(backend.supportsAccount).toBe(false);
  });

  it('never resolves to a signed-in session', async () => {
    await expect(backend.me()).resolves.toEqual({ status: 'anonymous' });
  });

  it('refuses uploads with a user-facing explanation', async () => {
    await expect(backend.upload()).rejects.toThrow(localOnlyMessage());
  });

  it('refuses to list snapshots', async () => {
    await expect(backend.listUploads(20)).rejects.toThrow(localOnlyMessage());
  });

  it('cannot complete a connection handshake', async () => {
    await expect(backend.claim('state')).resolves.toBeNull();
  });
});
