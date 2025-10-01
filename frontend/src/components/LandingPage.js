import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  return (
    <div className="card">
      <h2>Welcome to TopTrack</h2>
      <p>Create music jam sessions where everyone can add songs and vote for their favorites!</p>
      
      <div className="landing-options">
        <div className="option-card">
          <div className="option-icon">🎤</div>
          <h2>Create a Room</h2>
          <p>Start a new jam session. You'll need Spotify Premium to host and control playback.</p>
          <Link to="/create" className="btn">Create Room</Link>
        </div>
        
        <div className="option-card">
          <div className="option-icon">🎵</div>
          <h2>Join a Room</h2>
          <p>Join an existing jam session using a room code or link. No Spotify account required!</p>
          <Link to="/join" className="btn btn-secondary">Join Room</Link>
        </div>
      </div>
      
      <div style={{ marginTop: '40px', textAlign: 'center', color: '#666' }}>
        <h3>How it works:</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
          <div>
            <div style={{ fontSize: '2rem' }}>1️⃣</div>
            <p>Create or join a room</p>
          </div>
          <div>
            <div style={{ fontSize: '2rem' }}>2️⃣</div>
            <p>Add songs from Spotify/YouTube</p>
          </div>
          <div>
            <div style={{ fontSize: '2rem' }}>3️⃣</div>
            <p>Vote for your favorites</p>
          </div>
          <div>
            <div style={{ fontSize: '2rem' }}>4️⃣</div>
            <p>Enjoy the music together!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
