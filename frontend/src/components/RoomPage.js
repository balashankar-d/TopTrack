import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import axios from 'axios';
import SongQ from './SongQ';
import WebPlayback from './webplayback';
import { v4 as uuidv4 } from 'uuid';

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
  const [queue, setQueue] = useState([]);
  const [songInput, setSongInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Initialize user state from sessionStorage
  const [userId, setUserId] = useState(() => sessionStorage.getItem('userId'));
  const [username, setUsername] = useState(() => sessionStorage.getItem('username'));
  const [userRole, setUserRole] = useState(() => sessionStorage.getItem('userRole') || 'member');
  
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState(null);
  const [isLeaving, setIsLeaving] = useState(false);

  // Use ref to persist socket instance and other values
  const socketRef = useRef(null);
  const tokenRefreshTimeoutRef = useRef(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (socketRef.current) {
      console.log('[Cleanup] Disconnecting socket and leaving room');
      socketRef.current.emit('leave_room', { 
        room_id: roomId, 
        user_id: userId 
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, [roomId, userId]);

  // Navigation confirmation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isLeaving && socketRef.current?.connected) {
        cleanup();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();
    };
  }, [cleanup, isLeaving]);

  // Validate user session
  useEffect(() => {
    console.log('[Auth] Checking user session:', {
      userId,
      username,
      userRole,
      isSpotifyAuth: searchParams.get('auth_success') === 'true'
    });

    const spotifyUser = searchParams.get('spotify_user');
    const displayName = searchParams.get('display_name');
    const authSuccess = searchParams.get('auth_success');

    if (authSuccess === 'true' && spotifyUser && displayName) {
      console.log('[Auth] Spotify auth success detected');
      
      // Store host info in sessionStorage
      sessionStorage.setItem('userId', spotifyUser);
      sessionStorage.setItem('username', displayName);
      sessionStorage.setItem('userRole', 'host');
      
      setUserId(spotifyUser);
      setUsername(displayName);
      setUserRole('host');
      
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Check for existing user session
      const storedUserId = sessionStorage.getItem('userId');
      const storedUsername = sessionStorage.getItem('username');
      const storedRole = sessionStorage.getItem('userRole');

      console.log('[Auth] Checking stored session:', {
        storedUserId,
        storedUsername,
        storedRole
      });

      if (!storedUserId || !storedUsername) {
        // No valid user session, redirect to join page
        console.log('[Auth] No valid user session, redirecting to join page');
        navigate(`/join?room_id=${roomId}`);
        return;
      }

      // Valid session found, update state
      setUserId(storedUserId);
      setUsername(storedUsername);
      setUserRole(storedRole || 'member');

      console.log('[Auth] Using stored session:', {
        userId: storedUserId,
        username: storedUsername,
        role: storedRole || 'member'
      });
    }
  }, [searchParams, roomId, navigate]);

  // Socket initialization with proper dependencies
  useEffect(() => {
    if (!userId || !username || !roomId || !userRole) {
      console.log('[Socket.IO] Missing required info, skipping connection');
      return;
    }
    
    if (socketRef.current?.connected) {
      console.log('[Socket.IO] Socket already connected');
      return;
    }

    console.log('[Socket.IO] Initializing connection:', {
      userId,
      username,
      roomId,
      userRole
    });

    const socket = io("http://127.0.0.1:5000", {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: false
    });

    // Socket event handlers
    socket.on('connect', () => {
      console.log('[Socket.IO] Connected:', socket.id);
      socket.emit('join_room', {
        room_id: roomId,
        user_id: userId,
        username: username,
        role: userRole
      });
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', {
        reason,
        socketId: socket.id,
        wasConnected: socket.connected
      });
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection error:', {
        message: err.message,
        type: err.type,
        description: err.description
      });
    });

    socket.on('error', (data) => {
      console.error('[Socket.IO] Socket error:', {
        error: data,
        socketId: socket.id,
        roomId
      });
      setError(data.message || 'A socket error occurred');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket.IO] Reconnection attempt:', {
        attempt: attemptNumber,
        transport: socket.io.engine?.transport?.name
      });
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('[Socket.IO] Reconnected after attempts:', attemptNumber);
    });

    socket.on('user_joined', (data) => {
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
    socket.on('next_song', (data) => {
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

    // Queue and vote update handlers
    socket.on('queue_updated', (data) => {
      console.log('[Socket.IO] Queue updated:', data);
      setQueue(data.queue || []);
      
      // Check if current song should change based on votes
      const topSong = getTopVotedSong(data.queue);
      if (topSong && (!currentSong || topSong.uri !== currentSong.uri)) {
        console.log('[Queue] Top voted song changed:', topSong);
        if (userRole === 'host') {
          // Host will update the current song
          setCurrentSong(topSong);
        }
      }
    });

    socket.on('vote_updated', (data) => {
      console.log('[Socket.IO] Vote updated:', data);
      setQueue(data.queue || []);
      
      // If this affects the current song, update it
      if (data.queue_changed && data.current_song) {
        const formattedTrack = {
          uri: `spotify:track:${data.current_song.spotify_track_id}`,
          title: data.current_song.title,
          artist: data.current_song.artist,
          albumArt: data.current_song.image_url,
          duration_ms: data.current_song.duration_ms,
          votes: data.current_song.voted_by ? data.current_song.voted_by.length : 0
        };
        if (userRole === 'host' || !currentSong) {
          setCurrentSong(formattedTrack);
        }
      }
    });

    // Add user role specific handlers
    if (userRole === 'host') {
      socket.on('next_song_needed', () => {
        console.log('[Socket.IO] Next song needed (Host)');
        socket.emit('get_next_song', {
          room_id: roomId,
          user_id: userId
        });
      });
    } else {
      // Non-host users just update their display when song changes
      socket.on('song_changed', (data) => {
        console.log('[Socket.IO] Song changed (Member):', data);
        if (data.current_song) {
          const formattedTrack = {
            uri: `spotify:track:${data.current_song.spotify_track_id}`,
            title: data.current_song.title,
            artist: data.current_song.artist,
            albumArt: data.current_song.image_url,
            duration_ms: data.current_song.duration_ms,
            votes: data.current_song.voted_by ? data.current_song.voted_by.length : 0
          };
          setCurrentSong(formattedTrack);
        }
      });
    }

    // Store socket in ref and connect
    socketRef.current = socket;
    socket.connect();

    return () => cleanup();
  }, [userId, username, roomId, userRole, cleanup]);

  // Handle room leave
  const handleLeaveRoom = useCallback(async () => {
    const confirmed = window.confirm('Are you sure you want to leave this room?');
    if (!confirmed) return;

    setIsLeaving(true);
    cleanup();

    // Clear user session but keep room info
    sessionStorage.removeItem('userId');
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userRole');

    navigate('/');
  }, [navigate, cleanup]);

  // Token management with proper dependencies
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const tokenData = await getSpotifyToken(roomId);
        if (tokenData) {
          setSpotifyToken(tokenData.accessToken);
          setTokenExpiresAt(Date.now() + tokenData.expiresIn * 1000);
          return true;
        }
        return false;
      } catch (error) {
        console.error('Error fetching Spotify token:', error);
        setError('Failed to get Spotify access token');
        return false;
      }
    };

    const setupTokenRefresh = () => {
      if (tokenRefreshTimeoutRef.current) {
        clearTimeout(tokenRefreshTimeoutRef.current);
      }

      if (!tokenExpiresAt) return;

      const now = Date.now();
      const refreshDelay = Math.max(0, tokenExpiresAt - now - 5 * 60 * 1000); // 5 minutes before expiry
      console.log(`[Spotify] Setting token refresh in ${refreshDelay/1000} seconds`);

      tokenRefreshTimeoutRef.current = setTimeout(fetchToken, refreshDelay);
    };

    // Initial token fetch
    if (roomId && userRole === 'host') {
      fetchToken().then(() => {
        if (tokenExpiresAt) {
          setupTokenRefresh();
        }
      });
    }

    return () => {
      if (tokenRefreshTimeoutRef.current) {
        clearTimeout(tokenRefreshTimeoutRef.current);
      }
    };
  }, [roomId, userRole, tokenExpiresAt]);

  // Memoize getTopVotedSong function
  const getTopVotedSong = useCallback((queue) => {
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
      duration_ms: topSong.duration_ms,
      votes: topSong.voted_by ? topSong.voted_by.length : 0
    } : null;
  }, []);

  // Memoize fetchQueue function
  const fetchQueue = useCallback(async () => {
    if (!roomId) return;

    try {
      const response = await fetch(`http://127.0.0.1:5000/api/room/${roomId}/queue`);
      const data = await response.json();
      console.log("[Queue] Fetched queue:", data);
      setQueue(data.queue || []);
      
      // Set initial current song from queue only if there isn't one
      if (!currentSong) {
        const topSong = getTopVotedSong(data.queue);
        if (topSong) {
          console.log("[Queue] Setting initial current song:", topSong);
          setCurrentSong(topSong);
        }
      }
    } catch (error) {
      console.error("[Queue] Error fetching queue:", error);
      setError('Failed to fetch song queue');
    }
  }, [roomId, currentSong, getTopVotedSong]);

  // Extract song data from URL
  const extractSongData = useCallback(async (url) => {
    if (!url.includes('spotify.com/track/')) {
      throw new Error('Please enter a valid Spotify track URL');
    }

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
      throw new Error('Failed to get track information from Spotify');
    }
  }, [roomId]);

  // Handle adding songs to queue
  const handleAddSong = useCallback(async () => {
    if (!songInput.trim() || !socketRef.current) return;

    try {
      setIsLoading(true);
      const songData = await extractSongData(songInput);
      
      if (songData) {
        console.log('[Queue] Adding song to queue:', songData);
        socketRef.current.emit('add_song', {
          room_id: roomId,
          user_id: userId,
          song: songData
        });
        setSongInput('');
      }
    } catch (error) {
      console.error('[Queue] Failed to add song:', error);
      setError('Failed to add song to queue');
    } finally {
      setIsLoading(false);
    }
  }, [songInput, roomId, userId, extractSongData]);

  // Update handleNextSong to request next song from queue
  const handleNextSong = useCallback(() => {
    if (userRole === 'host' && socketRef.current) {
      console.log('[Socket.IO] Requesting next song from queue');
      socketRef.current.emit('get_next_song', {
        room_id: roomId,
        user_id: userId
      });
    }
  }, [roomId, userId, userRole]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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

      {/* Leave Room Button - Always visible */}
      <div className="leave-room">
        <button onClick={handleLeaveRoom}>Leave Room</button>
      </div>
    </div>
  );
};

export default RoomPage;