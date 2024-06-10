import React, { useState } from 'react';
import './App.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faPlus } from '@fortawesome/free-solid-svg-icons';

function Chatbot() {
  const [message, setMessage] = useState('');
  const [chats, setChats] = useState([]); // State to manage current chat
  const [previousChats, setPreviousChats] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0, availableTokens: 1000 });

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!message) return;

    setIsTyping(true);

    const timestamp = new Date().toLocaleTimeString();

    setChats((prevChats) => [...prevChats, { role: 'user', content: message, timestamp }]);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('http://localhost:8080/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch');
      }

      const data = await response.json();
      const responseText = data.text;

      setChats((prevChats) => [...prevChats, { role: 'bot', content: responseText, timestamp: new Date().toLocaleTimeString() }]);

      setTokenUsage({
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        availableTokens: data.usage.availableTokens
      });
    } catch (error) {
      console.error('Error processing message:', error);
    }

    setIsTyping(false);
  };

  const clearChats = () => {
    setChats([]);
  };

  const handleNewChat = () => {
   
    setPreviousChats((prevChats) => [...prevChats, chats]);
   
    setMessage('');
    setChats([]);
    setIsTyping(false);
    setTokenUsage({ inputTokens: 0, outputTokens: 0, availableTokens: 1000 });
  };

  const switchChat = (chatIndex) => {
    // Save current chat to previous chats
    setPreviousChats((prevChats) => [...prevChats, chats]);
    // Set new chat from previous chats
    setChats(previousChats[chatIndex]);
  };

  return (
    <main className="chatbot-container">
      <div className="previous-chats">
        <h2>Previous Chats</h2>
      
        {previousChats.map((chatHistory, index) => (
      <div key={index} className="chat-history-item">
        <button style={{width:"100%"}} onClick={() => switchChat(chatHistory)}>Chat {index + 1}</button>
      </div>
    ))}
        <button className="new-chat-button" onClick={handleNewChat}>
          <FontAwesomeIcon icon={faPlus} />
          New Chat
        </button>
      </div>
      <div className="divider"></div>
      <div className="chat-session">
        <div className="token-usage">
          <div>Input Tokens: {tokenUsage.inputTokens}</div>
          <div>Output Tokens: {tokenUsage.outputTokens}</div>
          <div>Available Tokens: {tokenUsage.availableTokens}</div>
        </div>
        <section>
          {chats && chats.length ? (
            chats.map((chat, index) => (
              <p key={index} className={chat.role === 'user' ? 'user_msg' : ''}>
                <span>
                  <b>{chat.role.toUpperCase()}</b>
                </span>
                <span>:</span>
                <span>{chat.content}</span>
                <span className="timestamp">{chat.timestamp}</span>
              </p>
            ))
          ) : (
            <p>No messages yet</p>
          )}
        </section>
        <div className={isTyping ? '' : 'hide'}>
          <p>
            <i>{isTyping ? 'Typing...' : ''}</i>
          </p>
        </div>
        <form onSubmit={sendMessage}>
          <div className="input-container">
            <input
              type="text"
              name="message"
              value={message}
              placeholder="Type a message here..."
              onChange={(e) => setMessage(e.target.value)}
            />
            <FontAwesomeIcon icon={faPaperPlane} onClick={sendMessage} className="send-icon" />
          </div>
        </form>
<button className="button button-secondary clear-chat-button" onClick={clearChats}>Clear Chat</button>
</div>
</main>
);
}

export default Chatbot;
