import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const CreateRoom = () => {
  const [roomName, setRoomName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Remove the useEffect that fetches authUrl - we'll fetch it when needed

  // Add error handling for Spotify callback errors
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const message = urlParams.get('message');
    
    if (error) {
      setError(`Authentication failed: ${message || error}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleSpotifyLogin = async () => {
    if (!roomName.trim()) {
      setError('Please enter a room name first');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Fetch auth URL with the room name
      const response = await fetch(`${API_URL}/api/spotify-login?room_name=${encodeURIComponent(roomName)}`);

      if (!response.ok) {
        throw new Error('Failed to get Spotify login URL');
      }
      
      const data = await response.json();
      
      if (!data.url) {
        throw new Error('No auth URL received from server');
      }
      
      // Store room name temporarily (though it's also in the state parameter)
      localStorage.setItem('pendingRoomName', roomName);
      
      // Redirect to Spotify OAuth
      window.location.href = data.url;
    } catch (error) {
      setError('Failed to connect to Spotify. Please try again.');
      setIsLoading(false);
    }
  };


  return (
    <div className="landing-page">
      {/* Animated Background */}
      <div className="wave-background"></div>

      {/* Header */}
      <header className="header">
        <Link to="/" className="logo">TopTrack</Link>
      </header>

      <div className="room-form">
        <h1 className="room-title">Create a Session</h1>
        <p className="room-subtitle">Start your music experience and invite friends to join</p>

        <div className="card">
          <div className="form-group">
            <label htmlFor="roomName">Session Name</label>
            <input
              type="text"
              id="roomName"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="Enter a name for your session"
              className="form-input"
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="auth-section">
            <p className="prerequisite-text" style={{marginBottom: '20px'}}>You'll need Spotify Premium to host this session</p>
            
            <div className="auth-options">
              <button 
                className="btn spotify-btn"
                onClick={handleSpotifyLogin}
                disabled={!roomName.trim() || isLoading}
                style={{width: '100%'}}
              >
                <span>🎵</span>
                {isLoading ? 'Connecting...' : 'Connect with Spotify Premium'}
              </button>
            </div>
          </div>

          <div className="info-box">
            <h4>Why Spotify Premium?</h4>
            <ul>
              <li>Control playback in the room</li>
              <li>Queue songs automatically</li>
              <li>Sync with all participants</li>
              <li>High-quality streaming</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateRoom;