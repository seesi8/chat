const { assertFails, assertSucceeds } = require('@firebase/testing');
const { setup, teardown } = require('./helpers');
const { buildDmThread, tomorrow } = require('./fixtures');

describe('threads rules (direct messaging)', () => {
  afterEach(async () => {
    await teardown();
  });

  test('denies reading threads when signed out', async () => {
    const db = await setup();
    await assertFails(db.collection('/threads').get());
  });

  test('denies reading thread when user is not a member', async () => {
    const seed = {
      '/threads/dm1': buildDmThread(['alice', 'bob']),
    };
    const db = await setup({ uid: 'mallory' }, seed);

    await assertFails(db.doc('/threads/dm1').get());
  });

  test('allows reading thread when user is a member', async () => {
    const seed = {
      '/threads/dm1': buildDmThread(['alice', 'bob']),
    };
    const db = await setup({ uid: 'alice' }, seed);

    await assertSucceeds(db.doc('/threads/dm1').get());
  });

  test('denies creating thread when auth user is not in members', async () => {
    const db = await setup({ uid: 'mallory' });
    await assertFails(db.doc('/threads/dm1').set(buildDmThread(['alice', 'bob'])));
  });

  test('denies creating thread with future timestamps', async () => {
    const db = await setup({ uid: 'alice' });
    await assertFails(
      db.doc('/threads/dm1').set(
        buildDmThread(['alice', 'bob'], {
          createdAt: tomorrow(),
          latestMessage: tomorrow(),
        })
      )
    );
  });

  test('denies creating thread missing required fields', async () => {
    const db = await setup({ uid: 'alice' });
    await assertFails(
      db.doc('/threads/dm1').set({
        members: ['alice', 'bob'],
        createdAt: new Date(),
        latestMessage: new Date(),
      })
    );
  });

  test('allows creating dm thread when required fields are valid', async () => {
    const db = await setup({ uid: 'alice' });
    await assertSucceeds(db.doc('/threads/dm1').set(buildDmThread(['alice', 'bob'])));
  });

  test('denies updating thread by non-member', async () => {
    const seed = {
      '/threads/dm1': buildDmThread(['alice', 'bob']),
    };
    const db = await setup({ uid: 'mallory' }, seed);

    await assertFails(
      db.doc('/threads/dm1').update({
        members: ['alice', 'bob'],
        groupName: 'Updated Name',
        createdAt: seed['/threads/dm1'].createdAt,
        latestMessage: new Date(),
        dm: true,
      })
    );
  });

  test('allows updating thread by member with valid payload', async () => {
    const seed = {
      '/threads/dm1': buildDmThread(['alice', 'bob']),
    };
    const db = await setup({ uid: 'alice' }, seed);

    await assertSucceeds(
      db.doc('/threads/dm1').update({
        members: ['alice', 'bob'],
        groupName: 'Updated Name',
        createdAt: seed['/threads/dm1'].createdAt,
        latestMessage: new Date(),
        dm: true,
      })
    );
  });
});
