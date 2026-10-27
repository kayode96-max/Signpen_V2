import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock('./config', () => ({
  supabase: {
    auth: { getSession },
    from,
  },
}));

import { doc, setDocumentNonBlocking } from './db-hooks';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function session(id: string, anonymous: boolean) {
  getSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id,
          is_anonymous: anonymous,
          app_metadata: { provider: anonymous ? 'anonymous' : 'email' },
        },
      },
    },
  });
}

describe('setDocumentNonBlocking students', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('creates and updates the signed-in owner row', async () => {
    session(OWNER, false);
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const upsert = vi.fn(async () => ({ error: null }));
    from.mockReturnValue({ update, upsert });

    await setDocumentNonBlocking(
      doc(null, 'students', OWNER),
      { name: 'Ada', email: 'ada@example.com' },
      { merge: false }
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: OWNER, name: 'Ada' }));
    expect(update).not.toHaveBeenCalled();

    upsert.mockClear();
    await setDocumentNonBlocking(
      doc(null, 'students', OWNER),
      { name: 'Ada Lovelace', pageSettings: { theme: 'dark' } },
      { merge: true }
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      id: OWNER,
      name: 'Ada Lovelace',
      pageSettings: { theme: 'dark' },
    }));
    expect(eq).toHaveBeenCalledWith('id', OWNER);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not write students for an anonymous signer session', async () => {
    session(OWNER, true);
    await setDocumentNonBlocking(doc(null, 'students', OWNER), { name: 'Anon' });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not write another user id', async () => {
    session(OWNER, false);
    await setDocumentNonBlocking(doc(null, 'students', OTHER), { name: 'Nope' }, { merge: true });
    expect(from).not.toHaveBeenCalled();
  });
});
