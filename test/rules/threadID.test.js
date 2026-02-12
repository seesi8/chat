const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setup, teardown } = require('./helpers');
const { buildDmThread } = require('./fixtures');

describe('threadsId rules (direct messaging)', () => {
  afterEach(async () => {
    await teardown();
  });

  test('allows reading thread ids while signed out', async () => {
    const db = await setup();
    await assertSucceeds(db.collection('/threadsId').get());
  });

  test('denies creating threadsId when thread does not exist in write set', async () => {
    const db = await setup({ uid: 'alice' });

    await assertFails(
      db.doc('/threadsId/dm1').set({
        id: 'dm1',
        members: ['alice', 'bob'],
      })
    );
  });

  test('denies creating threadsId when id field does not match document id', async () => {
    const db = await setup({ uid: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/threads/dm1'), buildDmThread(['alice', 'bob']));
    batch.set(db.doc('/threadsId/dm1'), {
      id: 'not-dm1',
      members: ['alice', 'bob'],
    });

    await assertFails(batch.commit());
  });

  test('denies creating threadsId when members do not match thread doc', async () => {
    const db = await setup({ uid: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/threads/dm1'), buildDmThread(['alice', 'bob']));
    batch.set(db.doc('/threadsId/dm1'), {
      id: 'dm1',
      members: ['alice', 'mallory'],
    });

    await assertFails(batch.commit());
  });

  test('denies creating threadsId when auth user is not in members', async () => {
    const db = await setup({ uid: 'mallory' });

    const batch = db.batch();
    batch.set(db.doc('/threads/dm1'), buildDmThread(['alice', 'bob']));
    batch.set(db.doc('/threadsId/dm1'), {
      id: 'dm1',
      members: ['alice', 'bob'],
    });

    await assertFails(batch.commit());
  });

  test('allows creating threadsId when id and members match thread write', async () => {
    const db = await setup({ uid: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/threads/dm1'), buildDmThread(['alice', 'bob']));
    batch.set(db.doc('/threadsId/dm1'), {
      id: 'dm1',
      members: ['alice', 'bob'],
    });

    await assertSucceeds(batch.commit());
  });
});
