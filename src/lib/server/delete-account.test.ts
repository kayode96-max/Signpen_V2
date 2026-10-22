import { describe, expect, it } from 'vitest';
import {
  AccountDeletionError,
  deleteOwnedAccount,
  OWNED_STORAGE_FOLDERS,
  STORAGE_BUCKET,
  type AccountAdmin,
} from '@/lib/server/delete-account';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function recordingAdmin(overrides: Partial<AccountAdmin> = {}) {
  const calls: { op: string; detail: unknown }[] = [];
  const admin: AccountAdmin = {
    async listStorage(prefix, offset, limit) {
      calls.push({ op: 'list', detail: { prefix, offset, limit } });
      return { data: [], error: null };
    },
    async removeStorage(paths) {
      calls.push({ op: 'remove', detail: paths });
      return { error: null };
    },
    async deleteWhere(table, column, value) {
      calls.push({ op: 'delete', detail: { table, column, value } });
      return { error: null };
    },
    async deleteAuthUser(userId) {
      calls.push({ op: 'auth', detail: userId });
      return { error: null };
    },
    ...overrides,
  };
  return { admin, calls };
}

describe('deleteOwnedAccount', () => {
  it('uses the signpen bucket and the two folders the uploader writes', () => {
    expect(STORAGE_BUCKET).toBe('signpen');
    expect(OWNED_STORAGE_FOLDERS).toEqual(['profile-photos', 'background-images']);
  });

  it('deletes only the caller, storage first and the auth user last', async () => {
    const { admin, calls } = recordingAdmin({
      async listStorage(prefix) {
        calls.push({ op: 'list', detail: prefix });
        if (prefix === `profile-photos/${USER}`) {
          return {
            data: [
              { name: 'avatar.png', id: 'file-1' },
              { name: '../students/other', id: 'file-2' },
              { name: 'nested/nope.png', id: 'file-3' },
              { name: 'folder', id: null },
            ],
            error: null,
          };
        }
        return { data: [{ name: 'bg.jpg', id: 'file-4' }], error: null };
      },
    });

    await deleteOwnedAccount(admin, USER);

    expect(calls.map((call) => call.op)).toEqual([
      'list',
      'remove',
      'list',
      'remove',
      'delete',
      'delete',
      'delete',
      'delete',
      'delete',
      'auth',
    ]);
    expect(calls[1].detail).toEqual([`profile-photos/${USER}/avatar.png`]);
    expect(calls[3].detail).toEqual([`background-images/${USER}/bg.jpg`]);
    expect(calls.filter((call) => call.op === 'delete').map((call) => call.detail)).toEqual([
      { table: 'thank_you_cards', column: 'studentId', value: USER },
      { table: 'signatures', column: 'studentId', value: USER },
      { table: 'signed_ips', column: 'studentId', value: USER },
      { table: 'sentiment_daily_usage', column: 'studentId', value: USER },
      { table: 'students', column: 'id', value: USER },
    ]);
    expect(calls.at(-1)).toEqual({ op: 'auth', detail: USER });
    expect(JSON.stringify(calls)).not.toContain('other-user');
  });

  it('collects every storage page before deleting so later pages are not skipped', async () => {
    const { admin, calls } = recordingAdmin({
      async listStorage(prefix, offset, limit) {
        calls.push({ op: 'list', detail: { prefix, offset, limit } });
        if (!prefix.startsWith('profile-photos/')) return { data: [], error: null };
        if (offset === 0) return { data: [{ name: 'a.png', id: '1' }], error: null };
        if (offset === 1) return { data: [{ name: 'b.png', id: '2' }], error: null };
        return { data: [], error: null };
      },
    });

    await deleteOwnedAccount(admin, USER, 1);

    const removed = calls.filter((call) => call.op === 'remove').map((call) => call.detail);
    expect(removed[0]).toEqual([
      `profile-photos/${USER}/a.png`,
      `profile-photos/${USER}/b.png`,
    ]);
    expect(calls.find((call) => call.op === 'delete')).toBeTruthy();
    expect(calls.at(-1)?.op).toBe('auth');
  });

  it('stops before deleting rows when storage listing fails', async () => {
    const { admin, calls } = recordingAdmin({
      async listStorage() {
        calls.push({ op: 'list', detail: 'fail' });
        return { data: null, error: { message: 'bucket missing' } };
      },
    });

    await expect(deleteOwnedAccount(admin, USER)).rejects.toBeInstanceOf(AccountDeletionError);
    expect(calls.map((call) => call.op)).toEqual(['list']);
  });
});
