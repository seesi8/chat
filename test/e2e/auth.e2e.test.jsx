/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreatePage from '../../pages/create.jsx';
import LoginForm from '../../components/login.jsx';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { createUser, uploadImage, login as performLogin } from '../../lib/functions';

if (typeof window !== 'undefined' && window.HTMLFormElement) {
  window.HTMLFormElement.prototype.requestSubmit = function requestSubmitPolyfill() {
    this.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
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

describe('auth e2e flows', () => {
  const pushMock = jest.fn();
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  afterAll(() => {
    logSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    pushMock.mockReset();
    useRouter.mockReturnValue({ push: pushMock });
    uploadImage.mockImplementation(() => {});
    createUser.mockImplementation(() => Promise.resolve(false));
  });

  describe('Create account page', () => {
    it('keeps submit disabled until a profile image and credentials are set', () => {
      render(<CreatePage />);

      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeDisabled();

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@user.dev' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'StrongPass!23' },
      });
      fireEvent.change(screen.getByPlaceholderText('Display Name'), {
        target: { value: 'New User' },
      });

      expect(submitButton).toBeDisabled();
    });

    it('submits credential bundle and redirects on success', async () => {
      uploadImage.mockImplementation((_event, setter) => {
        setter('https://example.com/avatar.png');
        return Promise.resolve();
      });
      createUser.mockResolvedValue(true);

      const { container } = render(<CreatePage />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@user.dev' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'StrongPass!23' },
      });
      fireEvent.change(screen.getByPlaceholderText('Display Name'), {
        target: { value: 'New User' },
      });

      const fileInput = container.querySelector('input[type="file"]');
      fireEvent.change(fileInput, {
        target: {
          files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })],
        },
      });

      const submitButton = screen.getByRole('button', { name: /submit/i });
      await waitFor(() => expect(submitButton).not.toBeDisabled());

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(createUser).toHaveBeenCalledWith(
          expect.any(Object),
          'new@user.dev',
          'StrongPass!23',
          'New User',
          'https://example.com/avatar.png',
        );
      });

      expect(pushMock).toHaveBeenCalledWith('/');
    });

    it('blocks submission attempts when profile picture is missing', () => {
      render(<CreatePage />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'new@user.dev' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'StrongPass!23' },
      });
      fireEvent.change(screen.getByPlaceholderText('Display Name'), {
        target: { value: 'New User' },
      });

      const form = screen.getByText('Create Account').closest('form');
      fireEvent.submit(form);

      expect(toast.error).toHaveBeenCalledWith('No Profile Picture');
      expect(createUser).not.toHaveBeenCalled();
    });
  });

  describe('Login form', () => {
    it('submits the provided credentials through the login helper', () => {
      render(<LoginForm />);

      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'existing@user.dev' },
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'mySecret!' },
      });

      const submitButton = screen.getByRole('button', { name: /submit/i });
      submitButton.setAttribute('type', 'button');
      fireEvent.click(submitButton);

      expect(performLogin).toHaveBeenCalledTimes(1);
      const [, emailArg, passwordArg] = performLogin.mock.calls[0];
      expect(emailArg).toBe('existing@user.dev');
      expect(passwordArg).toBe('mySecret!');
    });
  });
});
