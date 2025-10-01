import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

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
      const response = await fetch(`http://localhost:5000/api/spotify-login?room_name=${encodeURIComponent(roomName)}`);
      
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

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const tempHostId = 'demo_host_' + Date.now();
      
      const response = await axios.post('http://localhost:5000/api/rooms', {
        name: roomName,
        host_id: tempHostId
      });

      // Store host info
      localStorage.setItem('userId', tempHostId);
      localStorage.setItem('username', 'Demo Host');
      localStorage.setItem('userRole', 'host');

      // Navigate to room
      navigate(`/room/${response.data.room_id}`);
    } catch (error) {
      setError('Failed to create room. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <h2>Create a Room</h2>
      <p>Start your music jam session and invite friends to join!</p>

      <div className="form-group">
        <label htmlFor="roomName">Room Name</label>
        <input
          type="text"
          id="roomName"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Enter room name (e.g., Friday Night Vibes)"
          className="form-input"
          disabled={isLoading}
        />
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="auth-section">
        <h3>Authentication Required</h3>
        <p>As a host, you need Spotify Premium to control playback</p>
        
        <div className="auth-options">
          <button 
            className="btn spotify-btn"
            onClick={handleSpotifyLogin}
            disabled={!roomName.trim() || isLoading}
          >
            <span>🎵</span>
            {isLoading ? 'Connecting...' : 'Connect with Spotify Premium'}
          </button>
          
          <div className="divider">OR</div>
          
          <button 
            className="btn btn-secondary"
            onClick={handleCreateRoom}
            disabled={!roomName.trim() || isLoading}
          >
            {isLoading ? 'Creating...' : 'Create Room (Demo Mode)'}
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
  );
};

export default CreateRoom;