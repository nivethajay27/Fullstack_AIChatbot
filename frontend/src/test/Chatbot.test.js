

import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import Chatbot from '../Chatbot.jsx';

describe('Chatbot Component', () => {
  test('renders chatbot and handles message sending', async () => {
    render(<Chatbot />);

    fireEvent.change(screen.getByPlaceholderText('Type a message here and hit Enter...'), { target: { value: 'Hello, bot!' } });
    fireEvent.submit(screen.getByPlaceholderText('Type a message here and hit Enter...'));

    await waitFor(() => screen.getByText('USER: Hello, bot!'));
    
    expect(screen.getByText('USER: Hello, bot!')).toBeInTheDocument();
  });
});
