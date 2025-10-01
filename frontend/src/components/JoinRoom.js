import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

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

      // Generate user ID and store user info
      const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('userId', userId);
      localStorage.setItem('username', username);
      localStorage.setItem('userRole', 'member');

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
    <div className="card">
      <h2>Join a Room</h2>
      <p>Enter the room details to join an existing jam session!</p>

      <div className="form-group">
        <label htmlFor="username">Your Name</label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your display name"
          className="form-input"
          disabled={isLoading}
        />
      </div>

      <div className="form-group">
        <label htmlFor="roomInput">Room ID or Link</label>
        <input
          type="text"
          id="roomInput"
          value={roomInput}
          onChange={handleInputChange}
          placeholder="Enter room ID or paste room link"
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
        disabled={!roomInput.trim() || !username.trim() || isLoading}
      >
        {isLoading ? 'Joining...' : 'Join Room'}
      </button>

      <div className="info-box">
        <h4>Joining a Room</h4>
        <ul>
          <li>No account required to join</li>
          <li>Add songs to the queue</li>
          <li>Vote for your favorites</li>
          <li>Chat with other participants</li>
        </ul>
      </div>

    </div>
  );
};

export default JoinRoom;
