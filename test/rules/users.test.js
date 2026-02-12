const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setup, teardown } = require('./helpers');
const { buildUser, buildUsername, tomorrow } = require('./fixtures');

describe('users rules', () => {
  afterEach(async () => {
    await teardown();
  });

  test('denies reading users when signed out', async () => {
    const db = await setup();
    await assertFails(db.collection('/users').get());
  });

  test('allows reading users when signed in', async () => {
    const db = await setup({ uid: 'viewer' });
    await assertSucceeds(db.collection('/users').get());
  });

  test('allows creating own user when coupled username doc is in same batch', async () => {
    const db = await setup({ uid: 'alice' });
    const userData = buildUser('alice', { username: 'alice' });

    const batch = db.batch();
    batch.set(db.doc('/users/alice'), userData);
    batch.set(db.doc('/usernames/alice'), buildUsername('alice'));

    await assertSucceeds(batch.commit());
  });

  test('denies creating user when username doc is missing', async () => {
    const db = await setup({ uid: 'alice' });
    const userData = buildUser('alice', { username: 'alice' });

    await assertFails(db.doc('/users/alice').set(userData));
  });

  test('denies creating user when auth uid does not match document id', async () => {
    const db = await setup({ uid: 'alice' });
    const userData = buildUser('bob', { username: 'bob' });

    const batch = db.batch();
    batch.set(db.doc('/users/bob'), userData);
    batch.set(db.doc('/usernames/bob'), buildUsername('bob'));

    await assertFails(batch.commit());
  });

  test('denies creating user with future dates', async () => {
    const db = await setup({ uid: 'alice' });
    const userData = buildUser('alice', {
      username: 'alice',
      creationDate: tomorrow(),
      lastActive: tomorrow(),
    });

    const batch = db.batch();
    batch.set(db.doc('/users/alice'), userData);
    batch.set(db.doc('/usernames/alice'), buildUsername('alice'));

    await assertFails(batch.commit());
  });

  test('allows owner to update their own user document', async () => {
    const seed = {
      '/users/alice': buildUser('alice', { username: 'alice' }),
      '/usernames/alice': buildUsername('alice'),
    };
    const db = await setup({ uid: 'alice' }, seed);

    await assertSucceeds(
      db.doc('/users/alice').update({
        displayName: 'Alice Updated',
        username: 'alice',
        profileIMG: 'https://example.com/new.png',
        email: 'alice@example.com',
        creationDate: seed['/users/alice'].creationDate,
        lastActive: new Date(),
        friends: [],
      })
    );
  });

  test('allows non-owner to update only friends field', async () => {
    const baseUser = buildUser('alice', { username: 'alice' });
    const seed = {
      '/users/alice': baseUser,
      '/usernames/alice': buildUsername('alice'),
    };
    const db = await setup({ uid: 'bob' }, seed);

    await assertSucceeds(
      db.doc('/users/alice').update({
        displayName: baseUser.displayName,
        username: baseUser.username,
        profileIMG: baseUser.profileIMG,
        email: baseUser.email,
        creationDate: baseUser.creationDate,
        lastActive: baseUser.lastActive,
        friends: ['bob'],
      })
    );
  });

  test('denies non-owner updates when fields other than friends change', async () => {
    const baseUser = buildUser('alice', { username: 'alice' });
    const seed = {
      '/users/alice': baseUser,
      '/usernames/alice': buildUsername('alice'),
    };
    const db = await setup({ uid: 'bob' }, seed);

    await assertFails(
      db.doc('/users/alice').update({
        displayName: 'Hacked',
        username: baseUser.username,
        profileIMG: baseUser.profileIMG,
        email: baseUser.email,
        creationDate: baseUser.creationDate,
        lastActive: baseUser.lastActive,
        friends: baseUser.friends,
      })
    );
  });

  test('denies updates with future lastActive date', async () => {
    const baseUser = buildUser('alice', { username: 'alice' });
    const seed = {
      '/users/alice': baseUser,
      '/usernames/alice': buildUsername('alice'),
    };
    const db = await setup({ uid: 'alice' }, seed);

    await assertFails(
      db.doc('/users/alice').update({
        displayName: baseUser.displayName,
        username: baseUser.username,
        profileIMG: baseUser.profileIMG,
        email: baseUser.email,
        creationDate: baseUser.creationDate,
        lastActive: tomorrow(),
        friends: baseUser.friends,
      })
    );
  });
});
