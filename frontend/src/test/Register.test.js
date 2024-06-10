import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Register from '../Register.jsx';

describe('Register Component', () => {
  test('renders register form and handles submit', async () => {
    const mockOnRegister = jest.fn();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
      })
    );

    console.log = jest.fn();

    render(<Register onRegister={mockOnRegister} />);

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } });
    fireEvent.submit(screen.getByRole('button', { name: /Register/i }));

    await waitFor(() => expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Error registering:')));

    expect(mockOnRegister).not.toHaveBeenCalled(); // Ensure onRegister is not called due to mocked fetch
  });
});
