const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setup, teardown } = require('./helpers');
const { buildUser, buildUsername } = require('./fixtures');

describe('usernames rules', () => {
  afterEach(async () => {
    await teardown();
  });

  test('allows reading usernames while signed out', async () => {
    const db = await setup();
    await assertSucceeds(db.collection('/usernames').get());
  });

  test('allows creating username when coupled to same authenticated user', async () => {
    const db = await setup({ uid: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/users/alice'), buildUser('alice', { username: 'alice' }));
    batch.set(db.doc('/usernames/alice'), buildUsername('alice'));

    await assertSucceeds(batch.commit());
  });

  test('denies creating username when uid does not match auth uid', async () => {
    const db = await setup({ uid: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/users/alice'), buildUser('alice', { username: 'alice' }));
    batch.set(db.doc('/usernames/alice'), buildUsername('bob'));

    await assertFails(batch.commit());
  });

  test('denies creating username when resulting user doc username mismatches doc id', async () => {
    const db = await setup({ uid: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/users/alice'), buildUser('alice', { username: 'not-alice' }));
    batch.set(db.doc('/usernames/alice'), buildUsername('alice'));

    await assertFails(batch.commit());
  });
});
