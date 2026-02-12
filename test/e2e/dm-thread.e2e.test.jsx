/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import './setup/crypto-polyfills';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/router';

import ThreadPage from '../../pages/[thread]/index.jsx';
import { UserContext } from '../../lib/context';
import { useCollection } from 'react-firebase-hooks/firestore';
import { routeUser } from '../../lib/functions';

const submitMessageMock = jest.fn();
const decryptMessagesMock = jest.fn();

jest.mock('../../lib/firebase', () => ({
  auth: { currentUser: { uid: 'user-1' } },
  firestore: { __mocked: true },
}));

jest.mock('firebase/firestore', () => ({
  query: jest.fn(() => ({})),
  getDocs: jest.fn(),
  collection: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limitToLast: jest.fn(() => ({})),
  getDoc: jest.fn(),
  doc: jest.fn(() => ({})),
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('react-firebase-hooks/firestore', () => ({
  useCollection: jest.fn(),
}));

jest.mock('../../lib/functions', () => ({
  decryptMessages: jest.fn(),
  routeUser: jest.fn(),
  test: jest.fn(),
}));

jest.mock('../../lib/MessageHandler', () => ({
  MessageHandler: jest.fn().mockImplementation(() => ({
    decryptMessages: decryptMessagesMock,
    submitMessage: submitMessageMock,
    test: jest.fn(),
  })),
}));

jest.mock('../../lib/GroupMessageHandler.ts', () => ({
  GroupMessageHandler: {
    create: jest.fn(),
  },
}));

jest.mock('../../components/message', () => ({
  Message: ({ message }) => <div data-testid="message-row">{message.id}</div>,
}));

jest.mock('../../components/addMember', () => () => null);

describe('dm thread send flow', () => {
  const thread = {
    dm: true,
    members: ['user-1', 'user-2'],
    groupName: 'DM',
  };

  const baseUser = { uid: 'user-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = jest.fn();

    useRouter.mockReturnValue({
      asPath: '/thread-1',
      push: jest.fn(),
    });

    useCollection.mockReturnValue([
      {
        docs: [],
      },
      false,
      null,
    ]);

    routeUser.mockImplementation((_auth, _user, _threadId, setValid, setOwner) => {
      setValid(true);
      setOwner(true);
    });

    decryptMessagesMock.mockResolvedValue([]);
    submitMessageMock.mockResolvedValue(undefined);
  });

  test('sends dm message when user is valid and has private key', async () => {
    const data = {
      uid: 'user-1',
      username: 'userone',
      privateKey: { __key: true },
    };

    render(
      <UserContext.Provider value={{ user: baseUser, data }}>
        <ThreadPage threadId="thread-1" thread={thread} />
      </UserContext.Provider>
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'hello dm' },
    });

    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(submitMessageMock).toHaveBeenCalledWith([], 'hello dm', expect.any(Function));
    });
  });

  test('does not send when private key is missing', async () => {
    const data = {
      uid: 'user-1',
      username: 'userone',
    };

    render(
      <UserContext.Provider value={{ user: baseUser, data }}>
        <ThreadPage threadId="thread-1" thread={thread} />
      </UserContext.Provider>
    );

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'should not send' },
    });

    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(submitMessageMock).not.toHaveBeenCalled();
    });
  });
});
