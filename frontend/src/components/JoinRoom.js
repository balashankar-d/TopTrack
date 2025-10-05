import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const JoinRoom = () => {
  const [roomInput, setRoomInput] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const extractRoomId = (input) => {
    // Handle both room ID and full URL
    if (input.includes('/room/')) {
      return input.split('/room/')[1].split('?')[0];
    }
    return input.trim();
  };

  const handleJoinRoom = async () => {
    if (!roomInput.trim()) {
      setError('Please enter a room ID or link');
      return;
    }

    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const roomId = extractRoomId(roomInput);
      
      // Check if room exists
      const response = await axios.get(`http://localhost:5000/api/rooms/${roomId}`);
      
      if (!response.data.room.is_active) {
        setError('This room is no longer active');
        return;
      }

      // Generate a unique user ID using UUID v4
      const userId = uuidv4();

      // Store user info in sessionStorage to keep it tab-specific
      sessionStorage.setItem('userId', userId);
      sessionStorage.setItem('username', username);
      sessionStorage.setItem('userRole', 'member');

      // Store room info in localStorage since it's shared across tabs
      localStorage.setItem('roomId', roomId);

      // Navigate to room
      navigate(`/room/${roomId}`);
    } catch (error) {
      if (error.response?.status === 404) {
        setError('Room not found. Please check the room ID or link.');
      } else {
        setError('Failed to join room. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setRoomInput(e.target.value);
    setError(''); // Clear error when user types
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
        <h1 className="room-title">Join a Session</h1>
        <p className="room-subtitle">Enter the session details to join an existing music experience</p>

        <div className="card">
          <div className="form-group">
            <label htmlFor="username">Your Name</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="What should we call you?"
              className="form-input"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="roomInput">Session ID or Link</label>
            <input
              type="text"
              id="roomInput"
              value={roomInput}
              onChange={handleInputChange}
              placeholder="Enter session ID or paste session link"
              className="form-input"
              disabled={isLoading}
            />
            <small className="form-help">
              You can paste the full room link or just the room ID
            </small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            className="btn"
            onClick={handleJoinRoom}
            style={{width: '100%'}}
            disabled={!roomInput.trim() || !username.trim() || isLoading}
          >
            {isLoading ? 'Joining...' : 'Join Session'}
          </button>

          <div className="info-box">
            <h4>About Joining</h4>
            <ul>
              <li>No account required to join</li>
              <li>Add songs to the queue</li>
              <li>Vote for your favorites</li>
              <li>Chat with other participants</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;
