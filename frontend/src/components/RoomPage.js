import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import SongQ from './SongQ';
import WebPlayback from './webplayback';

// Spotify token management
export const getSpotifyToken = async (roomId) => {
  try {
    const response = await axios.get(`http://127.0.0.1:5000/api/spotify/token/room/${roomId}`);
    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in
    };
  } catch (error) {
    console.error('Failed to get Spotify token:', error);
    return null;
  }
};

// Utility function to check if token needs refresh
const isTokenExpired = (expiresAt) => {
  if (!expiresAt) return true;
  // Check if token expires in less than 5 minutes
  return Date.now() >= (expiresAt - 5 * 60 * 1000);
};

const RoomPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [room, setRoom] = useState(null);
  const [currentSong, setCurrentSong] = useState(null);
  const [queueData, setQueue] = useState([]); // Add state for queue
  const [songInput, setSongInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [userRole, setUserRole] = useState('member');
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null);

  // Handle Spotify success redirect
  useEffect(() => {
    console.log('=== ROOM PAGE LOADED ===');
    console.log('Room ID from params:', roomId);
    console.log('Current URL:', window.location.href);
    console.log('Search params:', Object.fromEntries(searchParams));
    console.log('========================');

    const spotifyUser = searchParams.get('spotify_user');
    const displayName = searchParams.get('display_name');
    const authSuccess = searchParams.get('auth_success');

    if (authSuccess === 'true' && spotifyUser && displayName) {
      console.log('Spotify auth success detected');
      
      // Store user info in state and localStorage
      setUserId(spotifyUser);
      setUsername(displayName);
      setUserRole('host');
      
      localStorage.setItem('userId', spotifyUser);
      localStorage.setItem('username', displayName);
      localStorage.setItem('userRole', 'host');
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Try to get user info from localStorage
      const storedUserId = localStorage.getItem('userId');
      const storedUsername = localStorage.getItem('username');
      const storedUserRole = localStorage.getItem('userRole');
      
      if (storedUserId && storedUsername) {
        setUserId(storedUserId);
        setUsername(storedUsername);
        setUserRole(storedUserRole || 'member');
      } else {
        // No user info available, redirect to join page
        navigate(`/join?room_id=${roomId}`);
        return;
      }
    }
  }, [searchParams, roomId, navigate]);

  // Helper function to get most voted song from queue
  const getTopVotedSong = (queue) => {
    if (!queue || queue.length === 0) return null;
    
    // Sort queue by votes in descending order
    const sortedQueue = [...queue].sort((a, b) => {
      const votesA = a.voted_by ? a.voted_by.length : 0;
      const votesB = b.voted_by ? b.voted_by.length : 0;
      return votesB - votesA;
    });

    // Return the first song (most voted)
    const topSong = sortedQueue[0];
    return topSong ? {
      uri: `spotify:track:${topSong.spotify_track_id}`,
      title: topSong.title,
      artist: topSong.artist,
      albumArt: topSong.image_url,
      duration_ms: topSong.duration_ms
    } : null;
  };

  // Use ref to persist socket instance
  const socketRef = useRef(null);

  // Initialize socket connection ONCE
  useEffect(() => {
    if (!userId || !username) {
      console.log('[Socket.IO] Missing userId or username, skipping connection');
      return;
    }
    
    // Check ref instead of state
    if (socketRef.current) {
      console.log('[Socket.IO] Socket already exists in ref, skipping creation');
      return;
    }

    console.log('[Socket.IO] Initializing socket connection:', {
      userId,
      username,
      roomId,
      backendUrl: 'http://127.0.0.1:5000'
    });

    // Use recommended options for Flask-SocketIO compatibility
    const newSocket = io("http://127.0.0.1:5000", {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000, // Increased timeout
      autoConnect: false // Don't connect automatically
    });

    // Set up event handlers before connecting
    newSocket.on('connect', () => {
      console.log('[Socket.IO] Connected successfully:', {
        socketId: newSocket.id,
        transport: newSocket.io.engine.transport.name
      });
      
      // Join room immediately after connection
      console.log('[Socket.IO] Joining room:', roomId);
      newSocket.emit('join_room', {
        room_id: roomId,
        user_id: userId,
        username: username
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', {
        reason,
        socketId: newSocket.id,
        wasConnected: newSocket.connected
      });
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection error:', {
        message: err.message,
        type: err.type,
        description: err.description
      });
    });

    newSocket.on('error', (data) => {
      console.error('[Socket.IO] Socket error:', {
        error: data,
        socketId: newSocket.id,
        roomId
      });
      setError(data.message || 'A socket error occurred');
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket.IO] Reconnection attempt:', {
        attempt: attemptNumber,
        transport: newSocket.io.engine?.transport?.name
      });
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[Socket.IO] Reconnected after attempts:', attemptNumber);
    });

    newSocket.on('user_joined', (data) => {
      console.log('[Socket.IO] User joined event:', {
        data,
        roomId,
        currentUserId: userId
      });
      setRoom(data.room || { id: roomId, name: data.room_name || 'Unknown Room' });
      setCurrentSong(data.current_song);
      setIsLoading(false);
    });

    // Add new handlers for queue and playback
    newSocket.on('next_song', (data) => {
      console.log('[Socket.IO] New song added:', data);
      // Update current song when queue changes
      if (data.current_song) {
        const formattedTrack = {
          uri: `spotify:track:${data.current_song.spotify_track_id}`,
          title: data.current_song.title,
          artist: data.current_song.artist,
          albumArt: data.current_song.image_url,
          duration_ms: data.current_song.duration_ms
        };
        setCurrentSong(formattedTrack);
      }
    });

    newSocket.on('next_song_needed', () => {
      console.log('[Socket.IO] Next song needed');
      // Request the next song from queue based on votes
      newSocket.emit('get_next_song', {
        room_id: roomId,
        user_id: userId
      });
    });

    // Add vote handler in socket setup
    newSocket.on('vote_updated', (data) => {
      console.log('[Socket.IO] Vote updated:', data);
      // If this affects the current song, update it
      if (data.queue_changed && data.current_song) {
        const formattedTrack = {
          uri: `spotify:track:${data.current_song.spotify_track_id}`,
          title: data.current_song.title,
          artist: data.current_song.artist,
          albumArt: data.current_song.image_url,
          duration_ms: data.current_song.duration_ms
        };
        setCurrentSong(formattedTrack);
      }
    });

    // Store socket in ref only
    socketRef.current = newSocket;

    // Connect after all handlers are set up
    console.log('[Socket.IO] Connecting socket...');
    newSocket.connect();

    return () => {
      console.log('[Socket.IO] Cleanup: checking socket state');
      if (socketRef.current) {
        console.log('[Socket.IO] Cleaning up socket connection:', {
          socketId: socketRef.current.id,
          roomId,
          wasConnected: socketRef.current.connected
        });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId, userId, username]); // Removed socket from dependencies
  
  // Spotify token management
  useEffect(() => {
    let tokenRefreshTimeout;

    const fetchToken = async () => {
      try {
        const tokenData = await getSpotifyToken(roomId);
        if (tokenData) {
          setSpotifyToken(tokenData.accessToken);
          setTokenExpiresAt(tokenData.expiresIn);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error fetching Spotify token:', error);
        setError('Failed to get Spotify access token');
        return false;
      }
    };

    const setupTokenRefresh = (expiresIn) => {
      // Clear any existing timeout
      if (tokenRefreshTimeout) {
        clearTimeout(tokenRefreshTimeout);
      }

      // Calculate when to refresh (5 minutes before expiration)
      const refreshDelay = Math.max(0, (expiresIn - 300) * 1000);
      console.log(`[Spotify] Setting token refresh in ${refreshDelay/1000} seconds`);

      tokenRefreshTimeout = setTimeout(async () => {
        console.log('[Spotify] Token refresh triggered');
        const success = await fetchToken();
        if (success) {
          console.log('[Spotify] Token refreshed successfully');
        }
      }, refreshDelay);
    };

    const initializeToken = async () => {
      if (roomId) {
        const success = await fetchToken();
        if (success && tokenExpiresAt) {
          setupTokenRefresh(tokenExpiresAt);
        }
      }
    };

    initializeToken();

    return () => {
      if (tokenRefreshTimeout) {
        clearTimeout(tokenRefreshTimeout);
      }
    };
  }, [roomId]);

  const extractSongData = async (url) => {
  // If it's a Spotify track, get info from backend
  if (url.includes('spotify.com/track/')) {
    try {
      const response = await axios.post('http://127.0.0.1:5000/api/spotify/track-info', {
        spotify_url: url,
        room_id: roomId
      });
      
      return {
        title: response.data.title,
        artist: response.data.artist,
        album: response.data.album,
        spotify_url: url,
        spotify_track_id: response.data.spotify_track_id,
        image_url: response.data.image_url,
        preview_url: response.data.preview_url,
        duration_ms: response.data.duration_ms
      };
    } catch (error) {
      console.error('Failed to get Spotify track info:', error);
      
      // Fallback to basic extraction
      const trackId = url.split('/track/')[1]?.split('?')[0];
      return {
        title: 'Spotify Track (Info unavailable)',
        artist: 'Unknown Artist',
        spotify_url: url,
        spotify_track_id: trackId
      };
    }
  }

};

// Update handleAddSong to be async
const handleAddSong = async () => {
  if (!songInput.trim()) return;

  try {
    setIsLoading(true); // You might want to add loading state for song addition
    
    await extractSongData(songInput);

    setSongInput('');
  } catch (error) {
    setError('Failed to add song');
  } finally {
    setIsLoading(false);
  }
};

  // Update handleNextSong to request next song from queue
  const handleNextSong = () => {
    if (userRole === 'host' && socketRef.current) {
      console.log('[Socket.IO] Requesting next song from queue');
      socketRef.current.emit('get_next_song', {
        room_id: roomId,
        user_id: userId
      });
    }
  };

  // Function to fetch current queue
  const fetchQueue = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:5000/api/room/${roomId}/queue`);
      const data = await response.json();
      console.log("Fetched queue:", data);
      setQueue(data.queue);
      
      // Set initial current song from queue
      const topSong = getTopVotedSong(data.queue);
      if (topSong && (!currentSong || topSong.uri !== currentSong.uri)) {
        console.log("Setting initial current song:", topSong);
        setCurrentSong(topSong);
      }
    } catch (error) {
      console.error("Error fetching queue:", error);
    }
  };

  // Fetch queue when component mounts or room code changes
  useEffect(() => {
    if (roomId) {
      fetchQueue();
    }
  }, [roomId]);

  if (isLoading) {
    return (
      <div className="loading">
        <h2>Loading room...</h2>
        <p>Connecting to {roomId}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  return (
    <div className="room-page">
      <div className="room-header">
        <h1>{room?.name || 'Music Room'}</h1>
        <p>Room ID: {roomId}</p>
        <p>Welcome, {username}! ({userRole})</p>
      </div>

      {/* Current Song Section */}
      <div className="current-song">
        <h2>Now Playing</h2>
        {userRole === 'host' ? (
          <WebPlayback
            accessToken={spotifyToken}
            currentSong={currentSong}
            onNextSong={handleNextSong}
            roomId={roomId}
            socket={socketRef.current}
          />
        ) : currentSong ? (
          <div className="song-info">
            <h3>{currentSong.title}</h3>
            <p>{currentSong.artist}</p>
          </div>
        ) : (
          <p>No song currently playing</p>
        )}
      </div>

      {/* Add Song Section */}
      <div className="add-song">
        <h3>Add Song</h3>
        <div className="song-input">
          <input
            type="text"
            value={songInput}
            onChange={(e) => setSongInput(e.target.value)}
            placeholder="Paste Spotify link or song name"
          />
          <button onClick={handleAddSong}>Add to Queue</button>
        </div>
      </div>

      {/* Song Queue Section */}
      {socketRef.current && <SongQ 
        roomId={roomId} 
        userId={userId} 
        socket={socketRef.current}
        
      />}

    </div>
  );
};

export default RoomPage;