import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  const [scrolled, setScrolled] = useState(false);

  // Handle header scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="landing-page">
      {/* Animated Background */}
      <div className="wave-background"></div>

      {/* Header */}
      <header className={`header ${scrolled ? 'header-scrolled' : ''}`}>
        <Link to="/" className="logo">TopTrack</Link>
      </header>

      {/* Hero Section */}
      <div className="hero-section">
        <h1 className="hero-title">Collaborative Music Experience</h1>
        <p className="hero-subtitle">
          Start a new music session or jump into an existing one.
        </p>

        <div className="hero-buttons">
          <Link to="/create" className="btn">Create Session</Link>
          <Link to="/join" className="btn btn-secondary">Join Session</Link>
        </div>
        
        <p className="prerequisite-text">Requires Spotify Premium to host</p>
      </div>
      

    </div>
  );
};

export default LandingPage;
