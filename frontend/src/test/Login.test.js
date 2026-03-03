import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Login from '../Login.jsx';

describe('Login Component', () => {
  test('renders login form and handles submit', async () => {
    const mockOnLogin = jest.fn();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
      })
    );

    render(<Login onLogin={mockOnLogin} />);

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.submit(screen.getByRole('button', { name: /Login/i }));

    await waitFor(() => expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument());

    expect(mockOnLogin).not.toHaveBeenCalled();
  });
});
