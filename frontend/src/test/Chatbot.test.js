
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Chatbot from '../Chatbot.jsx';

describe('Chatbot Component', () => {
  test('renders chatbot and handles message sending', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'Hello from bot',
            usage: { inputTokens: 2, outputTokens: 3, availableTokens: 995 },
          }),
      }),
    );

    render(<Chatbot />);

    fireEvent.change(screen.getByPlaceholderText('Type a message here and hit Enter...'), { target: { value: 'Hello, bot!' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(screen.getByText('Hello from bot')).toBeInTheDocument());
    expect(screen.getByText('Hello, bot!')).toBeInTheDocument();
  });
});
