/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CreateChatPopup from '../../components/CreateChatPopup.jsx';
import { UserContext } from '../../lib/context';
import { getSuggestionsFromInput, submitMember } from '../../lib/functions';
import { MessageHandler } from '../../lib/MessageHandler';

const createDRDMMock = jest.fn();

jest.mock('../../lib/functions', () => ({
  createDRDM: jest.fn(),
  createGroup: jest.fn(),
  getFriends: jest.fn(() => Promise.resolve([])),
  getSuggestionsFromInput: jest.fn(),
  removeMember: jest.fn((_e, item, members, user) =>
    members.filter((member) => member.uid !== item.uid || member.uid === user.uid)
  ),
  submitMember: jest.fn(),
}));

jest.mock('../../lib/MessageHandler', () => ({
  MessageHandler: jest.fn().mockImplementation(() => ({
    createDRDM: createDRDMMock,
  })),
}));

jest.mock('../../lib/GroupMessageHandler.ts', () => ({
  GroupMessageHandler: {
    create: jest.fn().mockResolvedValue({
      createThread: jest.fn(),
    }),
  },
}));

jest.mock('../../components/MemberSuggestion', () => ({
  MemberSuggestion: ({ item, addGroupMember, setMembersData, setCurrentInput }) => (
    <button
      type="button"
      data-testid={`member-suggestion-${item.uid}`}
      onClick={() =>
        addGroupMember(item).then((members) => {
          setMembersData(members);
          setCurrentInput('');
        })
      }
    >
      Add {item.username}
    </button>
  ),
}));

describe('CreateChatPopup direct message flow', () => {
  const user = { uid: 'user-1' };
  const data = {
    uid: 'user-1',
    username: 'userone',
    publicKey: 'pk-1',
  };

  const friend = {
    uid: 'user-2',
    username: 'friend',
    publicKey: 'pk-2',
    profileIMG: 'https://example.com/friend.png',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    createDRDMMock.mockResolvedValue('thread-123');

    getSuggestionsFromInput.mockImplementation((_friends, input) => {
      if (!input) return [];
      return [friend];
    });

    submitMember.mockImplementation(async (_item, _members) => [
      { uid: 'user-1', username: 'userone', publicKey: 'pk-1' },
      { uid: 'user-2', username: 'friend', publicKey: 'pk-2' },
    ]);
  });

  test('creates direct message through MessageHandler with selected member', async () => {
    const setPopup = jest.fn();

    render(
      <UserContext.Provider value={{ user, data }}>
        <CreateChatPopup setPopup={setPopup} />
      </UserContext.Provider>
    );

    expect(MessageHandler).toHaveBeenCalledWith(user, data);

    fireEvent.change(screen.getByPlaceholderText('Chat Name'), {
      target: { value: 'Friendly DM' },
    });

    fireEvent.change(screen.getByPlaceholderText('Member Username'), {
      target: { value: 'fri' },
    });

    const suggestion = await screen.findByTestId('member-suggestion-user-2');
    fireEvent.click(suggestion);

    await waitFor(() => expect(submitMember).toHaveBeenCalled());
    await screen.findByText('@friend');

    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(createDRDMMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ uid: 'user-1' }),
          expect.objectContaining({ uid: 'user-2' }),
        ]),
        'Friendly DM'
      );
    });

    expect(setPopup).toHaveBeenCalledWith(false);
  });
});
