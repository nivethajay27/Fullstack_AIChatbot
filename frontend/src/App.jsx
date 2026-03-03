import React, { useEffect, useState } from 'react';
import Login from './Login';
import Register from './Register';
import Chatbot from './Chatbot';
import './App.css';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [activeTab, setActiveTab] = useState('login');
  const [notice, setNotice] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
  }, [theme]);

  const handleLogin = (nextToken) => {
    localStorage.setItem('token', nextToken);
    setToken(nextToken);
    setNotice('');
  };

  const handleRegister = () => {
    setNotice('Registration successful. Please log in.');
    setActiveTab('login');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setActiveTab('login');
    setNotice('');
  };

  return (
    <div className="App" data-theme={theme}>
      <header className="header">
        <div>
          <h1>FullStack ChatBOT</h1>
        </div>
        <div className="header-actions">
          <button
            className="mode-toggle"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            type="button"
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          {token && (
            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      </header>

      {!token && (
        <div className="auth-shell">
          <div className="tabs">
            <button
              className={activeTab === 'login' ? 'active' : ''}
              onClick={() => setActiveTab('login')}
              type="button"
            >
              Login
            </button>
            <button
              className={activeTab === 'register' ? 'active' : ''}
              onClick={() => setActiveTab('register')}
              type="button"
            >
              Register
            </button>
          </div>

          {notice && <div className="notice-message">{notice}</div>}
          <div className="content">
            {activeTab === 'login' && <Login onLogin={handleLogin} />}
            {activeTab === 'register' && <Register onRegister={handleRegister} />}
          </div>
        </div>
      )}

      {token && (
        <div className="main-content">
          <Chatbot />
        </div>
      )}
    </div>
  );
}

export default App;
