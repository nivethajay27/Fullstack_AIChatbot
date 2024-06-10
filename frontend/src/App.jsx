import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import Chatbot from './Chatbot';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('login');

  const handleLogin = () => {
    setIsLoggedIn(true);
    setActiveTab('chatbot'); // Redirect to chatbot after login
  };

  const handleRegister = () => {
    setIsLoggedIn(true);
    setActiveTab('chatbot'); // Redirect to chatbot after registration
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setActiveTab('login'); // Redirect to login after logout
  };

  return (
    <Router>
      <div className="App">
        <div className="header">
          <h1>FullStack ChatBOT</h1>
          {!isLoggedIn && (
            <div className="tabs">
              <button
                className={activeTab === 'login' ? 'active' : ''}
                onClick={() => setActiveTab('login')}>
                Login
              </button>
              <button
                className={activeTab === 'register' ? 'active' : ''}
                onClick={() => setActiveTab('register')}
              >
                Register
              </button>
            </div>
          )}
          {isLoggedIn && (
            <div className="sub-heading">
              <button className="logout-button"  onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>

        <div className="content">
          {!isLoggedIn && activeTab === 'login' && <Login onLogin={handleLogin} />}
          {!isLoggedIn && activeTab === 'register' && <Register onRegister={handleRegister} />}
        </div>

        {isLoggedIn && (
          <div className="main-content">
            <Routes>
              <Route path="/chatbot" element={<Chatbot />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
        )}
      </div>
    </Router>
  );
}

export default App;
