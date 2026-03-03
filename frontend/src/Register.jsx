import React, { useState } from 'react';
import './App.css';
import { API_BASE_URL } from './config';

function Register({ onRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }
      onRegister();
    } catch (error) {
      console.error('Error registering:', error);
      setError('Could not register this user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-register-box">
      <form onSubmit={handleSubmit}>
        <h2>New User</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="submit-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Register'}
        </button>
        {error && <div className="error-message">{error}</div>}
      </form>
    </div>
  );
}

export default Register;
