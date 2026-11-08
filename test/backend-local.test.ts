import { describe, expect, it } from 'vitest';
import { LOCAL_ONLY_MESSAGE } from '../lib/backend/contract';
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
    await expect(backend.upload()).rejects.toThrow(LOCAL_ONLY_MESSAGE);
  });

  it('refuses to list snapshots', async () => {
    await expect(backend.listUploads(20)).rejects.toThrow(LOCAL_ONLY_MESSAGE);
  });

  it('cannot complete a connection handshake', async () => {
    await expect(backend.claim('state')).resolves.toBeNull();
  });
});
