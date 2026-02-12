/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { Person } from '../../components/person.jsx';
import { UserContext } from '../../lib/context';
import { useRequests } from '../../lib/hooks';
import {
  acceptFriend,
  getUserData,
  removeFriend,
  removeRequest,
  submitUsername,
} from '../../lib/functions';

jest.mock('../../lib/hooks', () => ({
  useRequests: jest.fn(),
}));

jest.mock('../../lib/functions', () => ({
  acceptFriend: jest.fn(),
  getUserData: jest.fn(),
  removeFriend: jest.fn(),
  removeRequest: jest.fn(),
  submitUsername: jest.fn(),
}));

jest.mock('../../components/ConfirmKeysPopup', () => () => <div data-testid="confirm-keys-popup" />);

describe('friend lifecycle controls', () => {
  const user = { uid: 'user-1' };
  const data = {
    uid: 'user-1',
    friends: [],
    publicKey: 'pk-1',
    username: 'userone',
  };
  const personItem = {
    uid: 'user-2',
    username: 'friend',
    profileIMG: 'https://example.com/friend.png',
  };

  const renderPerson = () =>
    render(
      <UserContext.Provider value={{ user, data }}>
        <Person item={personItem} />
      </UserContext.Provider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    getUserData.mockResolvedValue({
      id: 'user-2',
      uid: 'user-2',
      username: 'friend',
      publicKey: 'pk-2',
    });
  });

  test('calls removeFriend when relationship is disabled', () => {
    useRequests.mockReturnValue('disabled');
    renderPerson();

    fireEvent.click(screen.getByRole('button', { name: /remove friend/i }));

    expect(removeFriend).toHaveBeenCalledWith('user-2', user, data);
  });

  test('calls removeRequest for outgoing request', () => {
    useRequests.mockReturnValue('outgoing');
    renderPerson();

    fireEvent.click(screen.getByRole('button', { name: /stop friend request/i }));

    expect(removeRequest).toHaveBeenCalledWith('user-2', user, data);
  });

  test('calls submitUsername when adding a friend', async () => {
    useRequests.mockReturnValue('enabled');
    renderPerson();

    fireEvent.click(screen.getByRole('button', { name: /add friend/i }));

    await waitFor(() => {
      expect(getUserData).toHaveBeenCalledWith('user-2');
      expect(submitUsername).toHaveBeenCalledWith(
        'user-2',
        user,
        expect.objectContaining({ uid: 'user-2' })
      );
    });

    expect(screen.getByTestId('confirm-keys-popup')).toBeInTheDocument();
  });

  test('calls acceptFriend for incoming request', async () => {
    useRequests.mockReturnValue('incoming');
    renderPerson();

    fireEvent.click(screen.getByRole('button', { name: /accept friend/i }));

    await waitFor(() => {
      expect(getUserData).toHaveBeenCalledWith('user-2');
      expect(acceptFriend).toHaveBeenCalledWith('user-2', user, data);
    });

    expect(screen.getByTestId('confirm-keys-popup')).toBeInTheDocument();
  });
});
