import React, { useEffect, useState } from 'react';
import './SongQ.css';

const SongQ = ({ roomId, userId, socket }) => {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userVoteSongId, setUserVoteSongId] = useState(null);

  useEffect(() => {
    if (!socket) {
        console.error('[Socket.IO] No socket connection available');
        return;
    }

    console.log('[Socket.IO] Setting up SongQ listeners for room:', roomId);

    const fetchQueue = async () => {
        try {
            const res = await fetch(`http://localhost:5000/api/room/${roomId}/queue`);
            const data = await res.json();
            console.log('[Queue] Fetched initial queue:', data.songs);
            setSongs(data.songs || []);
            setLoading(false);

        } catch (error) {
            console.error('[Queue] Failed to fetch:', error);
            setLoading(false);
        }
    };

    // Define event handlers
    const handleSongAdded = (data) => {
        console.log('[Socket.IO] Song added event received:', data);
        if (!data || !data.song) {
            console.error('[Socket.IO] Invalid song data received');
            return;
        }

        setSongs(prev => {
            console.log('[Socket.IO] Adding song to queue:', {
                currentQueue: prev,
                newSong: data.song
            });
            // Sort by vote count after adding new song
            return [...prev, data.song].sort((a, b) => b.vote_count - a.vote_count);
        });
    };

    const handleSongVoted = (data) => {
    console.log('[Socket.IO] Vote event received:', data);
    
    setSongs(prev => {
        let updated = [...prev];
        
        // Update the vote count for the current song
        updated = updated.map(song =>
            song.id === data.song_id 
                ? { ...song, vote_count: data.vote_count }
                : song
        );

        // Sort by vote count after updating
        return updated.sort((a, b) => b.vote_count - a.vote_count);
    });

    // Update the user's current vote
    if (data.user_id === userId) {
        setUserVoteSongId(data.vote_type === 'removed' ? null : data.song_id);
    }};

    // Fetch initial queue
    fetchQueue();

    // Set up socket event listeners
    socket.on('song_added', handleSongAdded);
    socket.on('song_voted', handleSongVoted);

    // Cleanup function
    return () => {
        console.log('[Socket.IO] Cleaning up SongQ listeners');
        socket.off('song_added', handleSongAdded);
        socket.off('song_voted', handleSongVoted);
    };
  }, [roomId, userId, socket]);

 const handleVote = async (songId) => {
    if (!socket) {
        console.error('[Vote] No socket connection available');
        return;
    }
    try {
        // Single emit for all cases - backend handles the logic
        console.log('[Vote] Processing vote for song:', songId);
        socket.emit('vote_song', {
            room_id: roomId,
            song_id: songId,
            user_id: userId
        });
        // Local state will be updated when we receive the 'song_voted' event
        // This ensures UI stays in sync with server state
    } catch (error) {
        console.error('[Vote] Error handling vote:', error);
    }
  };

  if (loading) return <div className="songq-loading">Loading queue...</div>;

  return (
    <div className="songq-container">
      {songs.length === 0 ? (
        <div className="songq-empty">No songs in queue</div>
      ) : (
        <ul className="songq-list">
          {songs.sort((a, b) => b.vote_count - a.vote_count).map(song => (
            <li key={song.id} className="songq-item">
              <div className="songq-meta">
                <img src={song.image_url} alt={song.title} className="songq-img" />
                <div className="songq-info">
                  <div className="songq-name">{song.title}</div>
                  <div className="songq-artist">{song.artist}</div>
                  <div className="songq-album">{song.album}</div>
                  <div className="songq-duration">{Math.floor(song.duration / 60)}:{('0'+(song.duration % 60)).slice(-2)}</div>
                  <div className="songq-votes">Votes: {song.vote_count}</div>
                </div>
                <button
                  className={`songq-vote-btn${userVoteSongId === song.id ? ' voted' : ''}`}
                  onClick={() => handleVote(song.id)}
                >
                  {userVoteSongId === song.id ? 'Unvote' : 'Vote'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SongQ;
