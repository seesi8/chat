/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';

import CreatePage from '../../pages/create.jsx';
import LoginForm from '../../components/login.jsx';
import { auth } from '../../lib/firebase';
import { createUser, login as loginHelper, uploadImage } from '../../lib/functions';

if (typeof window !== 'undefined' && window.HTMLFormElement) {
  window.HTMLFormElement.prototype.requestSubmit = function requestSubmitPolyfill() {
    this.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
}

jest.mock('../../lib/firebase', () => ({
  auth: { __mocked: true },
}));

jest.mock('react-hot-toast', () => ({
  error: jest.fn(),
  success: jest.fn(),
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('../../lib/functions', () => ({
  createUser: jest.fn(),
  uploadImage: jest.fn(),
  login: jest.fn(),
}));

describe('account auth flows', () => {
  const pushMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: pushMock });
    createUser.mockResolvedValue(false);
    uploadImage.mockImplementation((setStorageUrl) => {
      setStorageUrl('https://example.com/avatar.png');
      return Promise.resolve();
    });
  });

  test('create account submit stays disabled until required values are present', () => {
    const { container } = render(<CreatePage />);
    const submitButton = screen.getByRole('button', { name: /submit/i });

    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass!123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Display Name'), {
      target: { value: 'User One' },
    });

    expect(submitButton).toBeDisabled();

    const fileInput = container.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })] },
    });

    expect(uploadImage).toHaveBeenCalled();
  });

  test('create account submits and routes home on success', async () => {
    createUser.mockResolvedValue(true);

    const { container } = render(<CreatePage />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass!123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Display Name'), {
      target: { value: 'User One' },
    });

    const fileInput = container.querySelector('input[type="file"]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })] },
    });

    const submitButton = screen.getByRole('button', { name: /submit/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        auth,
        'user@example.com',
        'StrongPass!123',
        'User One',
        'https://example.com/avatar.png'
      );
    });

    expect(pushMock).toHaveBeenCalledWith('/');
  });

  test('create account blocks form submit when profile image is missing', () => {
    uploadImage.mockImplementation(() => Promise.resolve());

    render(<CreatePage />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'StrongPass!123' },
    });
    fireEvent.change(screen.getByPlaceholderText('Display Name'), {
      target: { value: 'User One' },
    });

    const form = screen.getByText('Create Account').closest('form');
    fireEvent.submit(form);

    expect(toast.error).toHaveBeenCalledWith('No Profile Picture');
    expect(createUser).not.toHaveBeenCalled();
  });

  test('login forwards credentials through login helper', () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret-pass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(loginHelper).toHaveBeenCalledTimes(1);
    expect(loginHelper.mock.calls[0][1]).toBe('existing@example.com');
    expect(loginHelper.mock.calls[0][2]).toBe('secret-pass');
  });
});
