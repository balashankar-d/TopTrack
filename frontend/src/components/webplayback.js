import React, { useState, useEffect } from 'react';

// Initial track state
const track = {
    name: "",
    album: {
        images: [
            { url: "" }
        ]
    },
    artists: [
        { name: "" }
    ]
};

function WebPlayback({ accessToken, currentSong, onNextSong, roomId, socket }) {
    const [player, setPlayer] = useState(undefined);
    const [is_paused, setPaused] = useState(false);
    const [is_active, setActive] = useState(false);
    const [current_track, setTrack] = useState(track);
    const [device_id, setDeviceId] = useState(null);

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

                    <div className="now-playing__controls">
                        <button 
                            className="btn-spotify" 
                            onClick={() => { player.previousTrack() }}
                            disabled={!is_active}
                        >
                            &lt;&lt;
                        </button>

                        <button 
                            className="btn-spotify" 
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
                            {is_paused ? "PLAY" : "PAUSE"}
                        </button>

                        <button 
                            className="btn-spotify" 
                            onClick={() => { 
                                player.nextTrack();
                                onNextSong();
                            }}
                            disabled={!is_active}
                        >
                            &gt;&gt;
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default WebPlayback;