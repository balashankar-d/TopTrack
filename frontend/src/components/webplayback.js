import React, { useState, useEffect, useCallback } from 'react';
import './RoomPage.css';
import './webplayback.css';

const track = {
    name: "",
    album: {
        images: [
            { url: "" }
        ]
    },
    artists: [
        { name: "" }
    ],
    duration_ms: 0
};

function WebPlayback({ accessToken, currentSong, onNextSong, roomId, socket }) {
    const [player, setPlayer] = useState(undefined);
    const [is_paused, setPaused] = useState(false);
    const [is_active, setActive] = useState(false);
    const [current_track, setTrack] = useState(currentSong || track);
    const [device_id, setDeviceId] = useState(null);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(50);
    const [isVolumeVisible, setIsVolumeVisible] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);

    useEffect(() => {
        if (!accessToken) {
            console.error('[Spotify] No access token provided');
            return;
        }

        const script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;

        document.body.appendChild(script);

        window.onSpotifyWebPlaybackSDKReady = () => {
            const player = new window.Spotify.Player({
                name: 'TopTrack Player',
                getOAuthToken: cb => { cb(accessToken); },
                volume: 0.5
            });

            setPlayer(player);

            player.addListener('ready', ({ device_id }) => {
                console.log('[Spotify] Ready with Device ID:', device_id);
                setActive(true);
                setDeviceId(device_id);
                socket?.emit('spotify_device_ready', {
                    room_id: roomId,
                    device_id: device_id
                });
            });

            player.addListener('not_ready', ({ device_id }) => {
                console.log('[Spotify] Device ID has gone offline:', device_id);
                setDeviceId(null);
            });

            player.addListener('player_state_changed', (state => {
                if (!state) {
                    return;
                }

                setTrack(state.track_window.current_track);
                setPaused(state.paused);
                setProgress(state.position);
                setDuration(state.duration);

                player.getCurrentState().then(state => {
                    if (!state) {
                        setActive(false);
                    } else {
                        setActive(true);
                        // Check if track has finished
                        if (state.position === state.duration) {
                            console.log('[Spotify] Track finished, triggering next song');
                            onNextSong();
                        }
                    }
                });
            }));

            player.connect();
        };

        return () => {
            if (player) {
                console.log('[Spotify] Disconnecting player');
                player.disconnect();
            }
        };
    }, [accessToken, roomId, socket, onNextSong]);

    // Update current track when currentSong prop changes
    useEffect(() => {
        if (currentSong && player && device_id) {
            console.log('[Spotify] Current song updated:', currentSong);
            
            // Start playing the new song using Spotify Connect API
            fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    uris: [currentSong.uri]
                }),
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log('[Spotify] Successfully started playback');
                setPaused(false);
            })
            .catch(error => {
                console.error('[Spotify] Error starting playback:', error);
            });
        }
    }, [currentSong, player, device_id, accessToken]);

    const handleSeek = useCallback((value) => {
        if (!player || !is_active) return;
        
        const position = Math.round((value / 100) * duration);
        player.seek(position);
        setProgress(position);
    }, [player, is_active, duration]);

    const handleVolumeChange = useCallback((value) => {
        if (!player || !is_active) return;
        
        player.setVolume(value / 100);
        setVolume(value);
    }, [player, is_active]);

    // Progress update interval
    useEffect(() => {
        if (!is_active || !player || is_paused || isSeeking) return;

        const interval = setInterval(() => {
            player.getCurrentState().then(state => {
                if (state) {
                    setProgress(state.position);
                }
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [is_active, player, is_paused, isSeeking]);

    const formatTime = (ms) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (!accessToken) {
        return <div className="player-error">No Spotify access token available</div>;
    }

    if (!is_active) {
        return (
            <div className="player-inactive">
                <h3>Transfer playback to TopTrack</h3>
                <p>Open Spotify on your device and select "TopTrack Player"</p>
            </div>
        );
    }

    return (
        <div className="player-container">
            <div className="now-playing">
                <img 
                    src={current_track.album.images[0]?.url || currentSong?.albumArt || null} 
                    className="now-playing__cover" 
                    alt={current_track.name || currentSong?.title || "No track playing"}
                />

                <div className="now-playing__side">
                    <div className="now-playing__name">
                        {current_track.name}
                    </div>
                    <div className="now-playing__artist">
                        {current_track.artists[0].name}
                    </div>

                    <div className="now-playing__progress">
                        <span className="time">{formatTime(progress)}</span>
                        <input
                            type="range"
                            className="progress-bar"
                            value={(progress / duration) * 100 || 0}
                            onChange={(e) => handleSeek(e.target.value)}
                            onMouseDown={() => setIsSeeking(true)}
                            onMouseUp={() => setIsSeeking(false)}
                            disabled={!is_active}
                        />
                        <span className="time">{formatTime(duration)}</span>
                    </div>

                    <div className="now-playing__controls">
                        <button 
                            className="btn-spotify" 
                            onClick={() => { player.previousTrack() }}
                            disabled={!is_active}
                        >
                            <i className="fas fa-backward"></i>
                        </button>

                        <button 
                            className="btn-spotify btn-spotify--play" 
                            onClick={() => { 
                                player.togglePlay()
                                    .then(() => {
                                        console.log('[Spotify] Playback toggled successfully');
                                        setPaused(!is_paused);
                                    })
                                    .catch(error => {
                                        console.error('[Spotify] Error toggling playback:', error);
                                    });
                            }}
                            disabled={!is_active || !currentSong}
                        >
                            <i className={`fas fa-${is_paused ? 'play' : 'pause'}`}></i>
                        </button>

                        <button 
                            className="btn-spotify" 
                            onClick={() => { 
                                player.nextTrack();
                                onNextSong();
                            }}
                            disabled={!is_active}
                        >
                            <i className="fas fa-forward"></i>
                        </button>

                        <div className="volume-control">
                            <button 
                                className="btn-spotify btn-spotify--volume"
                                onClick={() => setIsVolumeVisible(!isVolumeVisible)}
                            >
                                <i className={`fas fa-volume-${volume === 0 ? 'mute' : volume < 50 ? 'down' : 'up'}`}></i>
                            </button>
                            {isVolumeVisible && (
                                <input
                                    type="range"
                                    className="volume-slider"
                                    min="0"
                                    max="100"
                                    value={volume}
                                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default WebPlayback;