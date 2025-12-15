/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateChatPopup from '../../components/CreateChatPopup.jsx';
import { UserContext } from '../../lib/context';

jest.mock('@firebase/util', () => ({
  uuidv4: jest.fn(() => 'mock-uuid'),
}));

const createDRDMMock = jest.fn();
const createGroupMock = jest.fn();
const getFriendsMock = jest.fn();
const getSuggestionsMock = jest.fn();
const removeMemberMock = jest.fn();
const submitMemberMock = jest.fn();

jest.mock('../../lib/functions', () => ({
  createDRDM: (...args) => createDRDMMock(...args),
  createGroup: (...args) => createGroupMock(...args),
  getFriends: (...args) => getFriendsMock(...args),
  getSuggestionsFromInput: (...args) => getSuggestionsMock(...args),
  removeMember: (...args) => removeMemberMock(...args),
  submitMember: (...args) => submitMemberMock(...args),
}));

jest.mock('../../components/MemberSuggestion', () => ({
  MemberSuggestion: ({ item, addGroupMember, setMembersData, setCurrentInput }) => (
    <button
      type="button"
      data-testid={`suggestion-${item.uid}`}
      onClick={() =>
        addGroupMember(item).then((members) => {
          setMembersData(members);
          setCurrentInput('');
        })
      }
    >
      {item.username}
    </button>
  ),
}));

const baseUser = {
  uid: 'user-1',
  username: 'userone',
  displayName: 'User One',
  publicKey: 'user-public',
  profileIMG: 'https://example.com/me.png',
};

describe('CreateChatPopup direct message flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createDRDMMock.mockResolvedValue('thread-xyz');
    createGroupMock.mockResolvedValue(false);
    getFriendsMock.mockResolvedValue([]);
    getSuggestionsMock.mockReturnValue([]);
    removeMemberMock.mockImplementation((_e, _item, members) => members);
    submitMemberMock.mockImplementation((item, members) =>
      Promise.resolve(
        members.find((member) => member.uid === item.uid)
          ? members
          : members.concat(item),
      ),
    );
  });

  it('creates a direct message when another account is selected and Create is pressed', async () => {
    const otherMember = {
      uid: 'user-2',
      username: 'friend',
      publicKey: 'friend-public',
      profileIMG: 'https://example.com/friend.png',
    };

    getSuggestionsMock.mockImplementation((_friends, currentInput) =>
      currentInput ? [otherMember] : [],
    );

    const setPopup = jest.fn();
    render(
      <UserContext.Provider value={{ user: baseUser, data: baseUser }}>
        <CreateChatPopup setPopup={setPopup} />
      </UserContext.Provider>,
    );

    fireEvent.change(screen.getByPlaceholderText('Chat Name'), {
      target: { value: 'Friendly DM' },
    });
    fireEvent.change(screen.getByPlaceholderText('Member Username'), {
      target: { value: 'friend' },
    });

    const suggestionButton = await screen.findByTestId('suggestion-user-2');
    fireEvent.click(suggestionButton);

    await waitFor(() => expect(submitMemberMock).toHaveBeenCalled());
    await screen.findByText('@friend');

    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(createDRDMMock).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user-1' }),
        expect.objectContaining({ username: 'userone' }),
        expect.arrayContaining([
          expect.objectContaining({ uid: 'user-1' }),
          expect.objectContaining({ uid: 'user-2' }),
        ]),
        'Friendly DM',
      ),
    );

    await waitFor(() => expect(setPopup).toHaveBeenCalledWith(false));
  });
});
