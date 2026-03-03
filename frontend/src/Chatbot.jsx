import React, { useState } from 'react';
import './App.css';
import { API_BASE_URL } from './config';

const createSession = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'New chat',
  messages: [],
});

const defaultUsage = {
  inputTokens: 0,
  outputTokens: 0,
  availableTokens: 1000,
};

function Chatbot() {
  const initialSession = createSession();
  const [message, setMessage] = useState('');
  const [sessions, setSessions] = useState([initialSession]);
  const [activeSessionId, setActiveSessionId] = useState(initialSession.id);
  const [isTyping, setIsTyping] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(defaultUsage);
  const [error, setError] = useState('');

  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];
  const chats = activeSession?.messages || [];

  const updateActiveSession = (updater) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== activeSessionId) {
          return session;
        }

        const nextMessages = updater(session.messages);
        const firstUserMessage = nextMessages.find((item) => item.role === 'user');
        const nextTitle = firstUserMessage
          ? `${firstUserMessage.content.slice(0, 24)}${firstUserMessage.content.length > 24 ? '...' : ''}`
          : 'New chat';

        return {
          ...session,
          title: nextTitle,
          messages: nextMessages,
        };
      }),
    );
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isTyping) return;

    setError('');
    setIsTyping(true);
    const userMessage = {
      role: 'user',
      content: trimmedMessage,
      timestamp: new Date().toLocaleTimeString(),
    };

    updateActiveSession((prevMessages) => [...prevMessages, userMessage]);
    setMessage('');

    try {
      const token = localStorage.getItem('token');

      const response = await fetch(`${API_BASE_URL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text: trimmedMessage }),
      });

      if (!response.ok) {
        throw new Error(response.status === 401 ? 'Session expired. Please log in again.' : 'Failed to get a response.');
      }

      const data = await response.json();
      const responseText = data.text;

      updateActiveSession((prevMessages) => [
        ...prevMessages,
        {
          role: 'bot',
          content: responseText,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);

      setTokenUsage({
        inputTokens: data.usage?.inputTokens || 0,
        outputTokens: data.usage?.outputTokens || 0,
        availableTokens: data.usage?.availableTokens ?? defaultUsage.availableTokens,
      });
    } catch (error) {
      console.error('Error processing message:', error);
      setError(error.message || 'Could not process your message.');
      updateActiveSession((prevMessages) => [
        ...prevMessages,
        {
          role: 'bot',
          content: 'Sorry, something went wrong while sending your message.',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const clearCurrentChat = () => {
    updateActiveSession(() => []);
  };

  const handleNewChat = () => {
    const nextSession = createSession();
    setSessions((prev) => [nextSession, ...prev]);
    setActiveSessionId(nextSession.id);
    setMessage('');
    setError('');
    setIsTyping(false);
    setTokenUsage(defaultUsage);
  };

  return (
    <main className="chatbot-container">
      <div className="previous-chats">
        <div className="panel-title">
          <h2>Chats</h2>
          <button className="new-chat-button" onClick={handleNewChat} type="button">
            + New Chat
          </button>
        </div>

        <div className="chat-history-list">
          {sessions.map((session, index) => (
            <button
              key={session.id}
              className={`chat-history-item ${session.id === activeSessionId ? 'active' : ''}`}
              onClick={() => setActiveSessionId(session.id)}
              type="button"
            >
              <strong>Chat {sessions.length - index}</strong>
              <span>{session.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="chat-session">
        <div className="token-usage">
          <div>
            <span>Input</span>
            <strong>{tokenUsage.inputTokens}</strong>
          </div>
          <div>
            <span>Output</span>
            <strong>{tokenUsage.outputTokens}</strong>
          </div>
          <div>
            <span>Available</span>
            <strong>{tokenUsage.availableTokens}</strong>
          </div>
        </div>

        <section className="messages-panel">
          {chats.length ? (
            chats.map((chat, index) => (
              <p key={index} className={chat.role === 'user' ? 'user_msg' : 'bot_msg'}>
                <span className="role">{chat.role === 'user' ? 'YOU' : 'BOT'}</span>
                <span className="message-content">{chat.content}</span>
                <span className="timestamp">{chat.timestamp}</span>
              </p>
            ))
          ) : (
            <p className="empty-state">No messages yet. Ask something to start the chat.</p>
          )}
        </section>

        {isTyping && (
          <div className="typing-state">
            <p>
              <i>Bot is typing...</i>
            </p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={sendMessage}>
          <div className="input-container">
            <input
              type="text"
              name="message"
              value={message}
              placeholder="Type a message here and hit Enter..."
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="send-button" type="submit" disabled={isTyping}>
              Send
            </button>
          </div>
        </form>

        <button className="button button-secondary clear-chat-button" onClick={clearCurrentChat} type="button">
          Clear Current Chat
        </button>
      </div>
    </main>
  );
}

export default Chatbot;
