import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Storage layout verified in src/supabase/storage.ts:
 *   bucket "signpen"
 *   profile-photos/{userId}/{fileName}
 *   background-images/{userId}/{fileName}
 * src/storage.rules documents the same two prefixes for the old Firebase bucket.
 * ASSUMPTION: the Supabase bucket is public (the client uses getPublicUrl) and
 * no other prefixes hold this user's files.
 */
export const STORAGE_BUCKET = 'signpen';
export const OWNED_STORAGE_FOLDERS = ['profile-photos', 'background-images'] as const;

export class AccountDeletionError extends Error {
  readonly step: string;

  constructor(step: string, message: string) {
    super(`${step}: ${message}`);
    this.name = 'AccountDeletionError';
    this.step = step;
  }
}

export interface StorageEntry {
  name: string;
  id: string | null;
}

export interface AccountAdmin {
  listStorage(
    prefix: string,
    offset: number,
    limit: number
  ): Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>;
  removeStorage(paths: string[]): Promise<{ error: { message: string } | null }>;
  deleteWhere(
    table: string,
    column: string,
    value: string
  ): Promise<{ error: { message: string } | null }>;
  deleteAuthUser(userId: string): Promise<{ error: { message: string } | null }>;
}

const PAGE = 100;

function safeObjectPath(folder: string, userId: string, name: string): string | null {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
  return `${folder}/${userId}/${name}`;
}

async function removeFolder(
  admin: AccountAdmin,
  folder: string,
  userId: string,
  pageSize: number
): Promise<void> {
  const prefix = `${folder}/${userId}`;
  const paths: string[] = [];
  // Collect every page before deleting. Deleting between pages would shift
  // the listing and skip objects.
  for (let offset = 0; ; offset += pageSize) {
    const listed = await admin.listStorage(prefix, offset, pageSize);
    if (listed.error) {
      throw new AccountDeletionError(`storage list ${prefix}`, listed.error.message);
    }
    const entries = listed.data ?? [];
    for (const entry of entries) {
      if (!entry.id || !entry.name) continue;
      const objectPath = safeObjectPath(folder, userId, entry.name);
      if (objectPath) paths.push(objectPath);
    }
    if (entries.length < pageSize) break;
  }

  if (paths.length > 0) {
    const removed = await admin.removeStorage(paths);
    if (removed.error) {
      throw new AccountDeletionError(`storage remove ${prefix}`, removed.error.message);
    }
  }
}

/**
 * Deletes only the caller's rows. Thank-you cards go before signatures
 * because thank_you_cards.signatureId references signatures.
 * The auth user is last so a failure earlier can be retried while login still works.
 * signature_signers rows for this board cascade from the signature delete.
 * Hashed IP rows on other people's boards are left in place (on delete set null)
 * so the 30-day rate limit still holds.
 */
export async function deleteOwnedAccount(
  admin: AccountAdmin,
  userId: string,
  pageSize = PAGE
): Promise<void> {
  if (!userId) {
    throw new AccountDeletionError('user', 'Missing user id.');
  }

  for (const folder of OWNED_STORAGE_FOLDERS) {
    await removeFolder(admin, folder, userId, pageSize);
  }

  const tables: { table: string; column: string }[] = [
    { table: 'thank_you_cards', column: 'studentId' },
    { table: 'signatures', column: 'studentId' },
    { table: 'signed_ips', column: 'studentId' },
    { table: 'sentiment_daily_usage', column: 'studentId' },
    { table: 'students', column: 'id' },
  ];

  for (const target of tables) {
    const result = await admin.deleteWhere(target.table, target.column, userId);
    if (result.error) {
      throw new AccountDeletionError(`delete ${target.table}`, result.error.message);
    }
  }

  const auth = await admin.deleteAuthUser(userId);
  if (auth.error) {
    throw new AccountDeletionError('auth user', auth.error.message);
  }
}

export function accountAdminFromSupabase(client: SupabaseClient): AccountAdmin {
  return {
    async listStorage(prefix, offset, limit) {
      const { data, error } = await client.storage.from(STORAGE_BUCKET).list(prefix, {
        limit,
        offset,
      });
      return {
        data: data?.map((file) => ({ name: file.name, id: file.id })) ?? null,
        error: error ? { message: error.message } : null,
      };
    },
    async removeStorage(paths) {
      const { error } = await client.storage.from(STORAGE_BUCKET).remove(paths);
      return { error: error ? { message: error.message } : null };
    },
    async deleteWhere(table, column, value) {
      const { error } = await client.from(table).delete().eq(column, value);
      return { error: error ? { message: error.message } : null };
    },
    async deleteAuthUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId);
      return { error: error ? { message: error.message } : null };
    },
  };
}
