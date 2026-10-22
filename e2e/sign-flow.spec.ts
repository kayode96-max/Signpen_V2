import { test } from './support';

/**
 * Placeholder for the write path. Not part of the read-only smoke.
 * A later change should open TEST_STUDENT_URL, sign, and assert the signature
 * was saved within 60 seconds. That needs a seeded graduate on a preview
 * Supabase project. Never point TEST_STUDENT_URL at production.
 */
test('sign flow: link tap to signature saved within 60 seconds', async () => {
  const studentUrl = process.env.TEST_STUDENT_URL;
  test.skip(
    !studentUrl,
    'Skipped: set TEST_STUDENT_URL to a seeded test graduate on a preview Supabase project.',
  );
  test.setTimeout(60_000);
  test.fixme(true, 'Placeholder. The 60-second sign flow is not implemented in this read-only suite.');
});
