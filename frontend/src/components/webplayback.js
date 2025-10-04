import React, { useState, useEffect, useCallback, useRef } from 'react';
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
    // Player instance and state refs
    const playerRef = React.useRef(null);
    const mountedRef = React.useRef(true);
    const lastStateRef = React.useRef(null);
    const retryTimeoutRef = React.useRef(null);
    const stateCheckIntervalRef = React.useRef(null);
    const healthCheckIntervalRef = React.useRef(null);

    // Component state
    const [is_paused, setPaused] = useState(true);  // Default to paused
    const [is_active, setActive] = useState(false);
    const [playerReady, setPlayerReady] = useState(false);
    const [deviceRegistered, setDeviceRegistered] = useState(false);
    const [current_track, setTrack] = useState(currentSong || track);
    const [device_id, setDeviceId] = useState(null);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(50);
    const [isVolumeVisible, setIsVolumeVisible] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const [playerError, setPlayerError] = useState(null);
    const [transferRequired, setTransferRequired] = useState(false);
    
    // Initialize Spotify Web Playback SDK
    useEffect(() => {
        if (!accessToken) return;

        // Set initial states
        setPlayerReady(false);
        setActive(false);
        setDeviceRegistered(false);
        
        // Define variables with scope for the entire useEffect
        let script = null;
        let originalHandler = window.onSpotifyWebPlaybackSDKReady;
        
        // Self-executing async function to handle initialization
        (async () => {

        // Clear any existing Spotify sessions first
        const clearExistingSessions = async () => {
            try {
                console.log('[Spotify] Attempting to clear existing player sessions...');
                
                // First check for existing stale TopTrack Player devices
                const deviceResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (deviceResponse.ok) {
                    const deviceData = await deviceResponse.json();
                    const topTrackDevices = deviceData.devices.filter(d => d.name === 'TopTrack Player');
                    if (topTrackDevices.length > 0) {
                        console.log(`[Spotify] Found ${topTrackDevices.length} existing TopTrack Player devices`);
                        
                        // If any device is active, try to pause it first
                        const activeDevice = topTrackDevices.find(d => d.is_active);
                        if (activeDevice) {
                            console.log('[Spotify] Pausing active TopTrack Player device:', activeDevice.id);
                            await fetch('https://api.spotify.com/v1/me/player/pause', {
                                method: 'PUT',
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`
                                }
                            }).catch(e => console.log('[Spotify] Could not pause active device:', e.message));
                        }
                    }
                }
                
                // Now get the current player state to see if there are active sessions
                const playerStateResponse = await fetch('https://api.spotify.com/v1/me/player', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                if (playerStateResponse.status !== 404) {
                    // There is an existing session, let's try to clear it
                    console.log('[Spotify] Existing player session found, clearing...');
                    
                    // Pause any playing content
                    await fetch('https://api.spotify.com/v1/me/player/pause', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    }).catch(e => console.log('[Spotify] No active playback to pause'));
                    
                    // Transfer to a null device to clear current device
                    await fetch('https://api.spotify.com/v1/me/player', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            device_ids: [],
                            play: false
                        })
                    }).catch(e => console.log('[Spotify] Could not transfer to null device'));
                    
                    // Wait for session to clear
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (error) {
                console.warn('[Spotify] Error clearing sessions:', error);
                // Continue anyway
            }
        };
        
        // Clear any existing sessions before initializing the player
        await clearExistingSessions();
        
        console.log('[Spotify] Setting up Web Playback SDK...');
        
        script = document.createElement("script");
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        
        // Set up script load promise with timeout and retry
        const scriptLoadPromise = new Promise((resolve, reject) => {
                let attempts = 0;
                const maxAttempts = 3;
                const timeout = 15000;

                const loadScript = () => {
                    const timeoutId = setTimeout(() => {
                        script.remove();
                        if (attempts < maxAttempts) {
                            attempts++;
                            console.log(`[Spotify] Retrying script load (${attempts}/${maxAttempts})`);
                            loadScript();
                        } else {
                            reject(new Error('Timeout loading Spotify SDK script after ' + maxAttempts + ' attempts'));
                        }
                    }, timeout);

                    script.onload = () => {
                        clearTimeout(timeoutId);
                        resolve();
                    };

                    script.onerror = (e) => {
                        clearTimeout(timeoutId);
                        script.remove();
                        if (attempts < maxAttempts) {
                            attempts++;
                            console.log(`[Spotify] Retrying script load after error (${attempts}/${maxAttempts})`);
                            loadScript();
                        } else {
                            reject(new Error('Failed to load Spotify SDK: ' + e.message));
                        }
                    };

                    document.body.appendChild(script);
                };

                loadScript();
            });

            // Set up SDK ready promise with longer timeout
            const sdkReadyPromise = new Promise((resolve, reject) => {
                let checkAttempts = 0;
                const maxCheckAttempts = 10;
                const checkInterval = 2000;

                const checkSDK = () => {
                    if (window.Spotify) {
                        console.log('[Spotify] SDK Ready');
                        resolve();
                    } else if (checkAttempts < maxCheckAttempts) {
                        checkAttempts++;
                        console.log(`[Spotify] Waiting for SDK (${checkAttempts}/${maxCheckAttempts})`);
                        setTimeout(checkSDK, checkInterval);
                    } else {
                        reject(new Error('Timeout waiting for Spotify SDK ready'));
                    }
                };

                window.onSpotifyWebPlaybackSDKReady = () => {
                    console.log('[Spotify] SDK Ready Event Received');
                    resolve();
                };

                // Start checking in case we missed the event
                setTimeout(checkSDK, 1000);
            });

            document.body.appendChild(script);

            // Wait for both script load and SDK ready
            Promise.all([scriptLoadPromise, sdkReadyPromise])
                .then(() => {
                    console.log('[Spotify] Initializing player...');
                    // Clean up any existing player
                if (playerRef.current) {
                    console.log('[Spotify] Cleaning up existing player instance');
                    playerRef.current.disconnect();
                    playerRef.current = null;
                }

                console.log('[Spotify] Creating new player instance');
                const newPlayer = new window.Spotify.Player({
                    name: 'TopTrack Player',
                    getOAuthToken: cb => { cb(accessToken); },
                    volume: 0.5
                });

                // Store player instance in ref
                playerRef.current = newPlayer;

                // Initialize error handlers first
                newPlayer.addListener('initialization_error', ({ message }) => {
                    console.error('[Spotify] Initialization Error:', message);
                    if (!mountedRef.current) return;
                    setPlayerReady(false);
                    setActive(false);
                    setDeviceRegistered(false);
                });

                newPlayer.addListener('authentication_error', ({ message }) => {
                    console.error('[Spotify] Authentication Error:', message);
                    if (!mountedRef.current) return;
                    setPlayerReady(false);
                    setActive(false);
                    setDeviceRegistered(false);
                });

                newPlayer.addListener('account_error', ({ message }) => {
                    console.error('[Spotify] Account Error:', message);
                    if (!mountedRef.current) return;
                    setPlayerReady(false);
                    setActive(false);
                    setDeviceRegistered(false);
                });

                newPlayer.addListener('playback_error', ({ message }) => {
                    console.error('[Spotify] Playback Error:', message);
                    if (!mountedRef.current) return;
                    // Don't set player as not ready for playback errors
                });

                // Ready handler
                newPlayer.addListener('ready', async ({ device_id }) => {
                    console.log('[Spotify] Player device ready:', device_id);
                    if (!mountedRef.current) return;

                    try {
                        // First, verify user has premium subscription (required for Web Playback SDK)
                        try {
                            const userResponse = await fetch('https://api.spotify.com/v1/me', {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`
                            }
                        });
                        
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            const hasPremium = userData.product === 'premium';
                            
                            if (!hasPremium) {
                                console.error('[Spotify] Spotify Premium is required for Web Playback');
                                setPlayerError('Spotify Premium is required for playback');
                                return;
                            }
                        }
                    } catch (error) {
                        console.warn('[Spotify] Could not verify premium status:', error);
                        // Continue anyway, the API will reject if not premium
                    }
                    
                    // Set device ID and mark player as ready
                    setDeviceId(device_id);
                    setPlayerReady(true);
                    setPlayerError(null);

                    // Ensure device is properly registered before marking as ready
                    console.log('[Spotify] Ensuring device is properly registered...');
                    
                    const ensureDeviceRegistration = async (maxAttempts = 10) => {
                        // Check for exact device ID and also check for partial matches by name
                        const findMatchingDevice = (devices, targetId) => {
                            // Log all available devices with details for debugging
                            if (devices.length > 0) {
                                console.log('[Spotify] All available devices:');
                                devices.forEach(d => {
                                    console.log(`- ${d.name} (ID: ${d.id.slice(0, 8)}...), active: ${d.is_active}, type: ${d.type}`);
                                });
                            }
                            
                            // First try exact ID match - this is the most reliable
                            const exactMatch = devices.find(d => d.id === targetId);
                            if (exactMatch) {
                                console.log('[Spotify] Found exact device match:', exactMatch.name, '(ID:', exactMatch.id.slice(0, 8) + '...)');
                                return exactMatch;
                            }
                            
                            // If no exact match, look for TopTrack Player devices
                            const nameMatches = devices.filter(d => d.name === 'TopTrack Player');
                            if (nameMatches.length > 0) {
                                console.log('[Spotify] Found', nameMatches.length, 'TopTrack Player devices by name');
                                
                                // Prefer active devices first
                                const activeMatch = nameMatches.find(d => d.is_active);
                                if (activeMatch) {
                                    console.log('[Spotify] Using active TopTrack Player device:', activeMatch.id.slice(0, 8) + '...');
                                    return activeMatch;
                                }
                                
                                // Otherwise use the most recent one (usually last in the list)
                                // This assumes Spotify lists devices in order of creation/discovery
                                const bestMatch = nameMatches[nameMatches.length - 1]; 
                                console.log('[Spotify] Using most recent TopTrack Player device:', bestMatch.id.slice(0, 8) + '...');
                                return bestMatch;
                            }
                            
                            console.log('[Spotify] No matching device found');
                            return null;
                        };
                        
                        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                            if (!mountedRef.current) return false;
                            
                            console.log(`[Spotify] Registration check attempt ${attempt}/${maxAttempts}`);
                            
                            try {
                                // First check if the device is already properly registered
                                console.log('[Spotify] Checking if device is already registered...');
                                const deviceCheckResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                                    headers: {
                                        'Authorization': `Bearer ${accessToken}`
                                    }
                                });

                                if (deviceCheckResponse.ok) {
                                    const deviceData = await deviceCheckResponse.json();
                                    console.log('[Spotify] Available devices:', deviceData.devices.map(d => `${d.name} (${d.id.slice(0, 6)}...), active: ${d.is_active}`));
                                    
                                    // Check for exact match or name-based match
                                    const matchingDevice = findMatchingDevice(deviceData.devices, device_id);
                                    
                                    if (matchingDevice) {
                                        console.log('[Spotify] Device found:', matchingDevice.name, 'ID:', matchingDevice.id.slice(0, 6) + '...', 'Active:', matchingDevice.is_active);
                                        
                                        // If we found a device but it's not an exact ID match, we need to update our reference
                                        if (matchingDevice.id !== device_id) {
                                            console.log('[Spotify] Updating device_id reference from', device_id.slice(0, 6) + '...', 'to', matchingDevice.id.slice(0, 6) + '...');
                                            setDeviceId(matchingDevice.id);
                                        }
                                        
                                        // If the device is already active, we're good to go
                                        if (matchingDevice.is_active) {
                                            console.log('[Spotify] Device is already active');
                                            return true;
                                        }
                                        
                                        // Otherwise try to activate it
                                        console.log('[Spotify] Device found but not active, attempting to activate');
                                    } else {
                                        console.log('[Spotify] Our device not found in device list');
                                    }
                                } else {
                                    console.warn('[Spotify] Could not check device list:', deviceCheckResponse.status);
                                }

                                // Step 1: Force device registration by setting it as active
                                console.log('[Spotify] Attempting device registration...');
                                
                                try {
                                    const registerResponse = await fetch('https://api.spotify.com/v1/me/player', {
                                        method: 'PUT',
                                        headers: {
                                            'Authorization': `Bearer ${accessToken}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            device_ids: [device_id],
                                            play: false
                                        })
                                    });
                                    
                                    // Handle 404 errors more gracefully - these are expected during initial device registration
                                    if (registerResponse.status === 404) {
                                        console.log('[Spotify] 404 response is expected during initial device registration');
                                        
                                        // Get an updated devices list to see if our device registered under a different ID
                                        try {
                                            const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                                                headers: {
                                                    'Authorization': `Bearer ${accessToken}`
                                                }
                                            });
                                            
                                            if (devicesResponse.ok) {
                                                const deviceData = await devicesResponse.json();
                                                const topTrackDevices = deviceData.devices.filter(d => d.name === 'TopTrack Player');
                                                
                                                if (topTrackDevices.length > 0) {
                                                    console.log('[Spotify] Found TopTrack devices despite 404:', topTrackDevices.length);
                                                    // Update our device_id if a device is found
                                                    const bestMatch = topTrackDevices.find(d => d.is_active) || topTrackDevices[0];
                                                    if (bestMatch.id !== device_id) {
                                                        console.log('[Spotify] Updating device_id from', device_id.slice(0, 8), 'to', bestMatch.id.slice(0, 8));
                                                        setDeviceId(bestMatch.id);
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            console.warn('[Spotify] Error checking devices after 404:', e);
                                        }
                                        
                                        // Make sure we're connected
                                        if (playerRef.current) {
                                            console.log('[Spotify] Trying to reconnect player...');
                                            await playerRef.current.connect();
                                        }
                                    } else if (!registerResponse.ok && registerResponse.status !== 204) {
                                        console.warn(`[Spotify] Device registration returned: ${registerResponse.status}`);
                                    } else {
                                        console.log('[Spotify] Device registration request successful');
                                    }
                                } catch (regError) {
                                    console.warn('[Spotify] Registration request error:', regError);
                                }

                                // Step 2: Wait for registration to propagate - give it more time
                                const waitTime = 3000 + (attempt * 1000);
                                console.log(`[Spotify] Waiting ${waitTime}ms for registration to propagate...`);
                                await new Promise(resolve => setTimeout(resolve, waitTime));

                                // Step 3: Verify device is now visible
                                try {
                                    const deviceResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                                        headers: {
                                            'Authorization': `Bearer ${accessToken}`
                                        }
                                    });
                                    
                                    if (deviceResponse.ok) {
                                        const deviceData = await deviceResponse.json();
                                        console.log('[Spotify] Updated devices list:', deviceData.devices.map(d => `${d.name} (${d.id.slice(0, 6)}...), active: ${d.is_active}`));
                                        
                                        // Look for our device again, including by name
                                        const matchingDevice = findMatchingDevice(deviceData.devices, device_id);
                                        
                                        if (matchingDevice) {
                                            console.log('[Spotify] Device successfully registered and visible:', 
                                                  matchingDevice.name, 'ID:', matchingDevice.id.slice(0, 6) + '...', 'Active:', matchingDevice.is_active);
                                            
                                            // Update our device_id if needed
                                            if (matchingDevice.id !== device_id) {
                                                console.log('[Spotify] Updating device_id from', device_id.slice(0, 6) + '...', 'to', matchingDevice.id.slice(0, 6) + '...');
                                                setDeviceId(matchingDevice.id);
                                            }
                                            
                                            return true; // Device is properly registered
                                        } else {
                                            console.log('[Spotify] Device not yet visible in devices list');
                                        }
                                    } else {
                                        console.warn('[Spotify] Could not check devices list:', deviceResponse.status);
                                    }
                                } catch (verifyError) {
                                    console.warn('[Spotify] Error verifying device:', verifyError);
                                }

                                // If we got this far without success, wait before next attempt
                                if (attempt < maxAttempts) {
                                    const waitTime = Math.min(5000, 1000 * attempt);
                                    console.log(`[Spotify] Waiting ${waitTime}ms before next attempt...`);
                                    await new Promise(resolve => setTimeout(resolve, waitTime));
                                }
                                
                            } catch (error) {
                                console.warn(`[Spotify] Registration attempt ${attempt} failed:`, error);
                                if (attempt < maxAttempts) {
                                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                                }
                            }
                        }
                        
                        // If we still failed after all attempts, but we see our player in the name
                        // matches, return true anyway as a fallback
                        try {
                            const lastCheckResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`
                                }
                            });
                            
                            if (lastCheckResponse.ok) {
                                const deviceData = await lastCheckResponse.json();
                                const nameMatches = deviceData.devices.filter(d => d.name === 'TopTrack Player');
                                if (nameMatches.length > 0) {
                                    console.log('[Spotify] Found TopTrack Player by name as fallback');
                                    const bestMatch = nameMatches.find(d => d.is_active) || nameMatches[0];
                                    setDeviceId(bestMatch.id);
                                    return true;
                                }
                            }
                        } catch (e) {
                            console.warn('[Spotify] Final device check failed:', e);
                        }
                        
                        return false; // Failed to register after all attempts
                    };
                    
                    // Try to ensure proper registration
                    const isRegistered = await ensureDeviceRegistration();
                    
                    if (isRegistered) {
                        console.log('[Spotify] Device is properly registered and ready');
                        setActive(true);
                        setDeviceRegistered(true);
                    } else {
                        console.warn('[Spotify] Device registration could not be verified, but marking as ready');
                        // Mark as ready anyway - some networks might block device listing
                        setActive(true);
                        setDeviceRegistered(true);
                    }

                    // Try to get initial state
                    const state = await newPlayer.getCurrentState();
                    
                    if (state) {
                        console.log('[Spotify] Setting initial state');
                        setPaused(state.paused);
                        setTrack(state.track_window.current_track);
                        setProgress(state.position);
                        setDuration(state.duration);
                    } else {
                        console.log('[Spotify] No initial state');
                        setPaused(true);
                    }

                    // Notify parent component
                    socket?.emit('spotify_device_ready', {
                        room_id: roomId,
                        device_id: device_id
                    });

                } catch (error) {
                    console.error('[Spotify] Error in ready handler:', error);
                    if (!mountedRef.current) return;
                    setPlayerError('Failed to initialize player state');
                    setActive(false);
                }
            });

            // Enhanced error handlers with state management
            newPlayer.addListener('initialization_error', ({ message }) => {
                console.error('[Spotify] Failed to initialize:', message);
                if (!mountedRef.current) return;
                
                setPlayerError(`Initialization failed: ${message}`);
                setPlayerReady(false);
                setActive(false);
                
                // Clean up player instance
                if (playerRef.current) {
                    playerRef.current.disconnect();
                    playerRef.current = null;
                }
            });

            newPlayer.addListener('authentication_error', ({ message }) => {
                console.error('[Spotify] Authentication failed:', message);
                if (!mountedRef.current) return;
                
                setPlayerError(`Authentication failed: ${message}`);
                setPlayerReady(false);
                setActive(false);
                
                // Clean up player instance
                if (playerRef.current) {
                    playerRef.current.disconnect();
                    playerRef.current = null;
                }
            });

            newPlayer.addListener('account_error', ({ message }) => {
                console.error('[Spotify] Account error:', message);
                if (!mountedRef.current) return;
                
                setPlayerError(`Account error: ${message}`);
                setPlayerReady(false);
                setActive(false);
                
                // Clean up player instance
                if (playerRef.current) {
                    playerRef.current.disconnect();
                    playerRef.current = null;
                }
            });

            newPlayer.addListener('playback_error', ({ message }) => {
                console.error('[Spotify] Playback error:', message);
                if (!mountedRef.current) return;

                // Don't set player as inactive for all playback errors
                if (message.includes('No active device found')) {
                    setActive(false);
                    setPlayerError('No active device found');
                } else {
                    // Log but don't fail completely for recoverable errors
                    console.warn('[Spotify] Recoverable playback error:', message);
                }
            });

            // Not ready handler with recovery attempt
            newPlayer.addListener('not_ready', ({ device_id }) => {
                console.log('[Spotify] Device ID has gone offline:', device_id);
                if (!mountedRef.current) return;

                if (device_id === playerRef.current?.deviceId) {
                    console.log('[Spotify] Current device went offline, attempting recovery');
                    setPlayerReady(false);
                    setActive(false);
                    
                    // Try to reconnect after a short delay
                    if (retryTimeoutRef.current) {
                        clearTimeout(retryTimeoutRef.current);
                    }
                    
                    retryTimeoutRef.current = setTimeout(async () => {
                        if (!mountedRef.current || !playerRef.current) return;
                        
                        try {
                            const success = await playerRef.current.connect();
                            if (success) {
                                console.log('[Spotify] Successfully recovered device connection');
                                setPlayerReady(true);
                                setActive(true);
                                setPlayerError(null);
                            }
                        } catch (error) {
                            console.error('[Spotify] Failed to recover device connection:', error);
                            setPlayerError('Failed to reconnect to device');
                        }
                    }, 2000);
                }
            });

            // Error handlers already defined above, no need to redefine them

            // Connection will be handled by the more robust connectWithRetry below

            // State change handler
            newPlayer.addListener('player_state_changed', (state) => {
                if (!mountedRef.current) return;
                
                if (!state) {
                    // Only update UI if we're not already paused
                    if (!is_paused) {
                        setActive(false);
                        setPaused(true);
                    }
                    return;
                }

                // Update UI with new state
                setActive(true);
                setTrack(state.track_window.current_track);
                setPaused(state.paused);
                setProgress(state.position);
                setDuration(state.duration);

                // Check if track finished
                if (state.position === 0 && state.paused && currentSong) {
                    console.log('[Spotify] Track finished, requesting next song');
                    onNextSong();
                }
            });

            // Connect the player with retry logic
            console.log('[Spotify] Connecting player...');
            let retryCount = 0;
            const maxRetries = 3;
            
            const connectWithRetry = () => {
                if (!mountedRef.current) return Promise.reject(new Error('Component unmounted'));
                
                console.log(`[Spotify] Connection attempt ${retryCount + 1}/${maxRetries}`);
                return newPlayer.connect()
                    .then(success => {
                        if (!mountedRef.current) throw new Error('Component unmounted');
                        
                        if (success) {
                            console.log('[Spotify] Player connected successfully');
                            // Wait for player to fully initialize with timeout
                            return new Promise((resolve, reject) => {
                                let stateCheckAttempts = 0;
                                const maxStateChecks = 10;
                                const stateCheckInterval = 2000;
                                let timeoutId = null;

                                const checkState = () => {
                                    if (!mountedRef.current || !playerRef.current) {
                                        clearTimeout(timeoutId);
                                        reject(new Error('Component unmounted during initialization'));
                                        return;
                                    }

                                    console.log(`[Spotify] Checking player state (${stateCheckAttempts + 1}/${maxStateChecks})`);
                                    
                                    playerRef.current.getCurrentState()
                                        .then(state => {
                                            if (!mountedRef.current) throw new Error('Component unmounted');
                                            
                                            if (state) {
                                                console.log('[Spotify] Initial state available after connect');
                                                setActive(true);
                                                resolve(true);
                                            } else if (stateCheckAttempts < maxStateChecks) {
                                                stateCheckAttempts++;
                                                timeoutId = setTimeout(checkState, stateCheckInterval);
                                            } else {
                                                // If we've reached max attempts but player is ready, resolve anyway
                                                if (playerRef.current && mountedRef.current) {
                                                    console.log('[Spotify] No state available but player is connected, continuing...');
                                                    setActive(true);
                                                    resolve(true);
                                                } else {
                                                    reject(new Error('Failed to get player state after maximum attempts'));
                                                }
                                            }
                                        })
                                        .catch(error => {
                                            console.warn('[Spotify] Error checking state:', error);
                                            if (stateCheckAttempts < maxStateChecks) {
                                                stateCheckAttempts++;
                                                timeoutId = setTimeout(checkState, stateCheckInterval);
                                            } else {
                                                reject(error);
                                            }
                                        });
                                };

                                // Start checking state
                                checkState();
                            });
                        } else {
                            throw new Error('Player connection failed');
                        }
                    })
                    .catch(error => {
                        if (!mountedRef.current) throw new Error('Component unmounted');
                        
                        console.error(`[Spotify] Connection attempt ${retryCount + 1} failed:`, error);
                        if (retryCount < maxRetries - 1) {
                            retryCount++;
                            // Exponential backoff for retries
                            return new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)))
                                .then(connectWithRetry);
                        }
                        throw error;
                    });
            };

            // Start the connection process
            connectWithRetry()
                .then(() => {
                    if (!mountedRef.current) return;
                    setPlayerReady(true);
                    console.log('[Spotify] Player initialization completed successfully');
                })
                .catch(error => {
                    if (!mountedRef.current) return;
                    console.error('[Spotify] Player initialization failed:', error);
                    setPlayerReady(false);
                    setActive(false);
                });
        })
        .catch(error => {
            console.error('[Spotify] Error initializing player:', error);
            setPlayerReady(false);
            setActive(false);
        });
        
        })(); // Close the async self-executing function

        return () => {
            // Restore original handler
            window.onSpotifyWebPlaybackSDKReady = originalHandler;
            
            // Disconnect player if it exists
            if (playerRef.current) {
                playerRef.current.disconnect();
                playerRef.current = null;
            }

            // Remove script if it's still in the document
            if (script && script.parentNode) {
                script.parentNode.removeChild(script);
            }

            // Reset states
            setPlayerReady(false);
            setActive(false);
            setDeviceRegistered(false);
            setDeviceId(null);
        };
    }, [accessToken]);

    // Track component mount state
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // Clean up player on unmount
            if (playerRef.current) {
                playerRef.current.disconnect();
                playerRef.current = null;
            }
            setPlayerReady(false);
            setActive(false);
            setDeviceRegistered(false);
        };
    }, []);

    // Handle currentSong changes
    useEffect(() => {
        if (!currentSong?.uri || !device_id || !playerReady || !accessToken) {
            return;
        }

        console.log('[Spotify] Current song changed to:', currentSong.title, 'URI:', currentSong.uri);

        // Keep track of the intended song URI for verification
        const targetSongUri = currentSong.uri;

        // Function to verify we're playing the correct track
        const verifySongPlaying = async () => {
            if (!playerRef.current) return false;
            try {
                const state = await playerRef.current.getCurrentState();
                
                if (!state || !state.track_window || !state.track_window.current_track) {
                    console.log('[Spotify] Could not verify playing track - no state available');
                    return false;
                }
                
                const currentUri = state.track_window.current_track.uri;
                const isCorrectTrack = currentUri === targetSongUri;
                
                console.log(
                    '[Spotify] Track verification:',
                    isCorrectTrack ? 'SUCCESS' : 'FAILED',
                    '\nExpected:', targetSongUri,
                    '\nActual:', currentUri
                );
                
                return isCorrectTrack;
            } catch (e) {
                console.warn('[Spotify] Error verifying track:', e);
                return false;
            }
        };

        const transferPlayback = async () => {
            try {
                // First, stop any currently playing content to avoid conflicts
                console.log('[Spotify] Stopping current playback before switching songs...');
                try {
                    await fetch('https://api.spotify.com/v1/me/player/pause', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    }).catch(e => console.log('[Spotify] No active playback to pause'));
                    
                    // Small delay to let the pause take effect
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (pauseError) {
                    console.warn('[Spotify] Could not pause current playback:', pauseError);
                    // Continue anyway
                }
                
                console.log('[Spotify] Starting robust playback transfer for:', currentSong.title);
                
                // Approach 1: Direct SDK playback with explicit URI (more reliable than just resume)
                try {
                    console.log('[Spotify] Forcing playback of specific song URI:', currentSong.uri);
                    if (playerRef.current) {
                        await playerRef.current.activateElement();
                        console.log('[Spotify] SDK element activated');
                        
                        // Important: The SDK doesn't have a play(uri) method
                        // So we must use the REST API to play a specific track on this device
                        console.log('[Spotify] Using direct REST API call to play specific URI');
                        const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ 
                                uris: [currentSong.uri],
                                position_ms: 0
                            })
                        });
                        
                        if (playResponse.ok || playResponse.status === 204) {
                            console.log('[Spotify] Direct URI play successful via REST API');
                            setActive(true);
                            setPaused(false);
                            
                            // Verify correct song is playing
                            setTimeout(async () => {
                                const isCorrect = await verifySongPlaying();
                                if (isCorrect) {
                                    console.log('[Spotify] Successfully confirmed correct song is playing');
                                    const state = await playerRef.current.getCurrentState();
                                    if (state && state.track_window.current_track) {
                                        // Update the UI track
                                        setTrack(state.track_window.current_track);
                                    }
                                } else {
                                    console.warn('[Spotify] Wrong song detected! Attempting to retry playback...');
                                    // Will continue to next method
                                }
                            }, 1000);
                            
                            // We still return to prevent multiple simultaneous approaches
                            return;
                        } else {
                            console.warn('[Spotify] Direct URI play failed with status:', playResponse.status);
                        }
                    }
                } catch (apiError) {
                    console.warn('[Spotify] Direct URI play failed:', apiError);
                }
                
                // Approach 2: Ensure device is properly activated and registered
                console.log('[Spotify] SDK direct approach failed, trying full device activation...');
                
                // Step 1: Make absolutely sure the device exists in Spotify
                let deviceExists = false;
                let deviceIsActive = false;
                
                try {
                    console.log('[Spotify] Checking device registration status...');
                    const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    if (devicesResponse.ok) {
                        const deviceData = await devicesResponse.json();
                        console.log('[Spotify] Available devices:', 
                            deviceData.devices.map(d => `${d.name} (${d.id.slice(0, 6)}..., active: ${d.is_active})`));
                        
                        const ourDevice = deviceData.devices.find(d => d.id === device_id);
                        if (ourDevice) {
                            console.log('[Spotify] Our device is registered:', ourDevice.name);
                            deviceExists = true;
                            deviceIsActive = ourDevice.is_active;
                        } else {
                            console.log('[Spotify] Our device is NOT found in the device list');
                        }
                    }
                } catch (error) {
                    console.warn('[Spotify] Error checking device status:', error);
                }
                
                // Step 2: If device is not properly registered, try to register it
                if (!deviceExists) {
                    console.log('[Spotify] Device not registered, attempting to register...');
                    
                    // Try to explicitly register the device
                    try {
                        const connectResponse = await fetch('https://api.spotify.com/v1/me/player', {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                device_ids: [device_id],
                                play: false
                            })
                        });
                        
                        // Wait for registration to take effect
                        console.log('[Spotify] Waiting for device registration to take effect...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // Check again if the device is now registered
                        const devicesCheckResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        
                        if (devicesCheckResponse.ok) {
                            const deviceData = await devicesCheckResponse.json();
                            const ourDevice = deviceData.devices.find(d => d.id === device_id);
                            if (ourDevice) {
                                console.log('[Spotify] Device successfully registered after explicit attempt');
                                deviceExists = true;
                                deviceIsActive = ourDevice.is_active;
                            } else {
                                console.log('[Spotify] Device still not registered after explicit attempt');
                            }
                        }
                    } catch (regError) {
                        console.warn('[Spotify] Error registering device:', regError);
                    }
                }
                
                // Step 3: Try multiple approaches to activate the device and start playback
                console.log('[Spotify] Attempting to activate device and play...');
                
                // Skip the direct SDK play approach since resume() doesn't allow specifying a track
                // We need to force playing a specific URI, not just resume previous playback
                
                // Now try the standard play with device_id approach
                try {
                    console.log('[Spotify] Trying standard API play with device_id...');
                    const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            uris: [currentSong.uri],
                            position_ms: 0
                        })
                    });
                    
                    if (playResponse.ok || playResponse.status === 204) {
                        console.log('[Spotify] Standard play approach successful');
                        setActive(true);
                        setPaused(false);
                        setPlayerError(null);
                        
                        // Check the player state after a short delay to confirm
                        setTimeout(async () => {
                            const isCorrect = await verifySongPlaying();
                            if (isCorrect) {
                                console.log('[Spotify] Successfully confirmed correct song is playing');
                                const state = await playerRef.current.getCurrentState();
                                if (state && state.track_window.current_track) {
                                    // Update the UI track
                                    setTrack(state.track_window.current_track);
                                }
                            } else {
                                console.warn('[Spotify] Wrong song detected after standard play! Trying next method...');
                                // Will continue to next method if this fails
                            }
                        }, 1000);
                        
                        // We still return here to prevent multiple simultaneous approaches
                        return;
                    } else if (playResponse.status === 404) {
                        console.warn('[Spotify] 404 error during play - device may not be fully registered yet');
                    } else {
                        console.warn('[Spotify] Standard play failed with status:', playResponse.status);
                    }
                } catch (playError) {
                    console.warn('[Spotify] Standard play error:', playError);
                }
                
                // Step 4: Final fallback - try the queue-based approach
                console.log('[Spotify] Trying queue-based fallback approach...');
                
                try {
                    // Transfer to our device
                    const transferResponse = await fetch('https://api.spotify.com/v1/me/player', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            device_ids: [device_id],
                            play: false
                        })
                    });
                    
                    // Wait for transfer
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Add to queue
                    const queueResponse = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(currentSong.uri)}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });
                    
                    if (queueResponse.ok || queueResponse.status === 204) {
                        // Skip to our queued track
                        const skipResponse = await fetch('https://api.spotify.com/v1/me/player/next', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        });
                        
                        if (skipResponse.ok || skipResponse.status === 204) {
                            // Start playing
                            const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
                                method: 'PUT',
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`
                                }
                            });
                            
                            if (playResponse.ok || playResponse.status === 204) {
                                console.log('[Spotify] Queue-based approach successful');
                                setActive(true);
                                setPaused(false);
                                setPlayerError(null);
                                
                                // Verify correct song after queue approach
                                setTimeout(async () => {
                                    const isCorrect = await verifySongPlaying();
                                    if (isCorrect) {
                                        console.log('[Spotify] Queue approach confirmed playing correct song');
                                        const state = await playerRef.current.getCurrentState();
                                        if (state && state.track_window.current_track) {
                                            // Update the UI track
                                            setTrack(state.track_window.current_track);
                                        }
                                    } else {
                                        console.warn('[Spotify] Wrong song detected even after queue approach');
                                    }
                                }, 1000);
                                
                                return;
                            }
                        }
                    }
                } catch (fallbackError) {
                    console.warn('[Spotify] Queue-based fallback error:', fallbackError);
                }
                
                // Last resort approach: Try to clear current context entirely first
                console.log('[Spotify] All standard approaches failed, trying emergency fallback...');
                
                try {
                    // First clear any current context
                    console.log('[Spotify] Clearing current playback context...');
                    await fetch('https://api.spotify.com/v1/me/player/pause', {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    }).catch(e => console.log('[Spotify] No playback to pause'));
                    
                    // Wait a moment
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Then force setting our device as active without starting playback
                    console.log('[Spotify] Forcing device activation without playback...');
                    await fetch('https://api.spotify.com/v1/me/player', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            device_ids: [device_id],
                            play: false
                        })
                    });
                    
                    // Give it a moment to take effect
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Finally, directly play our track
                    console.log('[Spotify] Emergency attempt to play specific URI:', currentSong.uri);
                    const emergencyPlayResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            uris: [currentSong.uri],
                            position_ms: 0
                        })
                    });
                    
                    if (emergencyPlayResponse.ok || emergencyPlayResponse.status === 204) {
                        console.log('[Spotify] Emergency playback approach succeeded');
                        setActive(true);
                        setPaused(false);
                        setPlayerError(null);
                        
                        setTimeout(() => verifySongPlaying(), 1000);
                        return;
                    } else {
                        throw new Error(`Emergency play failed with status: ${emergencyPlayResponse.status}`);
                    }
                } catch (emergencyError) {
                    console.error('[Spotify] Emergency playback attempt failed:', emergencyError);
                    throw new Error('All playback approaches including emergency fallback failed');
                }
            } catch (error) {
                console.error('[Spotify] Transfer/playback failed:', error);
                setPlayerError(`Failed to play song: ${error.message}`);
            }
        };

        transferPlayback();
    }, [currentSong, device_id, playerReady, accessToken]);

    // Helper functions
    const formatTime = useCallback((ms) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, []);

    // Enhanced safe player action with retries and state verification
    const safePlayerAction = useCallback(async (action, actionName, options = {}) => {
        const { maxRetries = 2, checkState = true } = options;
        
        if (!playerRef.current || !playerReady || !mountedRef.current) {
            console.log(`[Spotify] Cannot ${actionName}: player not ready`);
            return false;
        }

        let retries = 0;
        while (retries <= maxRetries) {
            try {
                // Verify player state if needed
                if (checkState) {
                    const state = await playerRef.current.getCurrentState();
                    if (!state && is_active) {
                        console.log(`[Spotify] No state available for ${actionName}, retrying...`);
                        retries++;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }

                // Attempt the action
                await action();
                console.log(`[Spotify] ${actionName} completed successfully`);
                return true;
            } catch (error) {
                console.error(`[Spotify] ${actionName} failed (attempt ${retries + 1}):`, error);
                
                if (retries < maxRetries) {
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                } else {
                    return false;
                }
            }
        }
        return false;
    }, [playerReady, is_active]);

    // Helper function to safely get player state
    const safeGetCurrentState = useCallback(async () => {
        if (!playerRef.current || !playerReady || !mountedRef.current) {
            console.log('[Spotify] Cannot get current state: player not ready');
            return null;
        }

        try {
            const state = await playerRef.current.getCurrentState();
            if (!mountedRef.current) return null;  // Check mount state again after await

            if (!state) {
                console.log('[Spotify] No playback state available');
                // Only set active to false if we're not already paused
                if (!is_paused && mountedRef.current) {
                    setActive(false);
                }
                return null;
            }

            // If we got a state, ensure we're marked as active
            if (!is_active && mountedRef.current) {
                setActive(true);
            }

            return state;
        } catch (error) {
            if (!mountedRef.current) return null;
            
            console.error('[Spotify] Error getting current state:', error);
            // Only set inactive if we were previously active
            if (is_active) {
                setActive(false);
            }
            return null;
        }
    }, [playerReady, is_paused, is_active]);

    // Add a periodic state verification effect
    useEffect(() => {
        if (!playerReady || !is_active || !mountedRef.current) return;

        const verifyInterval = setInterval(async () => {
            if (!mountedRef.current) return;

            const state = await safeGetCurrentState();
            if (state) {
                // Update progress if we're not seeking
                if (!isSeeking) {
                    setProgress(state.position);
                }
                // Verify our paused state matches reality
                if (state.paused !== is_paused) {
                    console.log('[Spotify] Fixing paused state mismatch');
                    setPaused(state.paused);
                }
            }
        }, 3000);  // Check every 3 seconds

        return () => clearInterval(verifyInterval);
    }, [playerReady, is_active, is_paused, isSeeking, safeGetCurrentState]);

    // Add ref for tracking last progress
    const lastProgressRef = useRef(0);

    // Progress update interval with optimized updates
    useEffect(() => {
        if (!is_active || !playerRef.current || is_paused || isSeeking || !playerReady || !mountedRef.current) return;

        const updateInterval = setInterval(async () => {
            if (!mountedRef.current || isSeeking) {
                return;
            }

            try {
                const state = await playerRef.current?.getCurrentState();
                if (!state || !mountedRef.current) return;

                // Only update if position has changed significantly (more than 1 second)
                const newProgress = state.position;
                if (Math.abs(newProgress - lastProgressRef.current) > 1000) {
                    lastProgressRef.current = newProgress;
                    setProgress(newProgress);
                }
            } catch (error) {
                console.warn('[Spotify] Error updating progress:', error);
            }
        }, 1000);

        // Cleanup interval on unmount or dependencies change
        return () => {
            clearInterval(updateInterval);
        };
    }, [is_active, is_paused, isSeeking, playerReady]); // Remove progress from dependencies

    // Enhanced play/pause handler with proper device initialization
    const handlePlay = useCallback(async () => {
        if (!currentSong?.uri) {
            console.log('[Spotify] No song available to play');
            return;
        }

        if (!device_id) {
            console.error('[Spotify] No device ID available');
            setPlayerError('Player not initialized. Please wait...');
            return;
        }

        try {
            // First try SDK controls if we have state
            const state = playerRef.current ? await playerRef.current.getCurrentState() : null;
            
            if (state) {
                console.log('[Spotify] Using SDK player controls');
                if (state.paused) {
                    await playerRef.current.resume();
                    setPaused(false);
                } else {
                    await playerRef.current.pause();
                    setPaused(true);
                }
                return;
            }

            // If no SDK state, try Web API
            console.log('[Spotify] Using Web API controls');
            
            // Initialize device
            await fetch('https://api.spotify.com/v1/me/player', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    device_ids: [device_id],
                    play: true
                })
            });

            // Give Spotify a moment to register the device
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Start playback
            const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    uris: [currentSong.uri],
                    position_ms: 0
                })
            });

            if (!playResponse.ok && playResponse.status !== 404) {
                throw new Error(`Failed to start playback: ${playResponse.status}`);
            }

            setPaused(false);
            setPlayerError(null);

        } catch (error) {
            console.error('[Spotify] Playback control failed:', error);
            setPlayerError(`Playback failed: ${error.message}`);
        }
    }, [currentSong, device_id, accessToken]);

    // Seek debounce timer
    const seekDebounceRef = useRef(null);

    const handleSeek = useCallback(async (value) => {
        if (!playerRef.current || !device_id) {
            console.warn('[Spotify] Cannot seek: player not ready');
            return;
        }

        const position = Math.round((value / 100) * duration);
        console.log(`[Spotify] Seeking to position ${position}ms`);

        try {
            // Try SDK seek first
            const success = await playerRef.current.seek(position);
            if (!success) {
                // Fall back to Web API
                await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${position}&device_id=${device_id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    }
                });
            }
        } catch (error) {
            console.warn('[Spotify] Seek failed:', error);
        }
    }, [device_id, accessToken, duration]);

    const handleVolumeChange = useCallback(async (value) => {
        const success = await safePlayerAction(async () => {
            await playerRef.current.setVolume(value / 100);
            setVolume(value);
            
            // Verify volume change
            const state = await playerRef.current.getCurrentState();
            if (state && Math.abs(state.volume - (value / 100)) > 0.1) {
                throw new Error('Volume change verification failed');
            }
        }, 'change volume', { checkState: false });

        if (!success) {
            console.error('[Spotify] Failed to change volume after retries');
        }
    }, [safePlayerAction]);

    // Show different states based on player status
    if (!accessToken) {
        return <div className="player-error">No Spotify access token available</div>;
    }

    if (!playerReady) {
        return (
            <div className="player-inactive">
                <h3>Initializing Player...</h3>
                <p>Please wait while we set up your playback device</p>
            </div>
        );
    }

    if (!deviceRegistered || !is_active) {
        return (
            <div className="player-inactive">
                <h3>Setting up Spotify Player...</h3>
                <p>Please wait while we register your device with Spotify</p>
            </div>
        );
    }

    if (!currentSong) {
        return (
            <div className="player-inactive">
                <h3>Ready to Start</h3>
                <p>Your Spotify player is ready!</p>
                <button 
                    className="btn-spotify btn-spotify--play" 
                    onClick={onNextSong}
                    disabled={!playerReady || !is_active || !deviceRegistered}
                >
                    Start Session
                </button>
            </div>
        );
    }

    return (
        <div className="player-container">
            <div className="now-playing">
                <img 
                    src={current_track?.album?.images?.[0]?.url || currentSong?.albumArt || null} 
                    className="now-playing__cover" 
                    alt={current_track?.name || currentSong?.title || "No track playing"}
                />

                <div className="now-playing__side">
                    <div className="now-playing__name">
                        {current_track?.name || currentSong?.title || "Loading..."}
                    </div>
                    <div className="now-playing__artist">
                        {current_track?.artists?.[0]?.name || currentSong?.artist || "Unknown Artist"}
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

                    <div className="now-playing__controls">                        <button 
                            className="btn-spotify" 
                            onClick={async () => {
                                // Always call onNextSong for previous track to get the right track
                                onNextSong('previous');
                            }}
                            disabled={!playerReady}
                        >
                            <i className="fas fa-backward"></i>
                        </button>

                        <button 
                            className="btn-spotify btn-spotify--play" 
                            onClick={handlePlay}
                            disabled={!playerReady || !currentSong}
                        >
                            <i className={`fas fa-${is_paused ? 'play' : 'pause'}`}></i>
                        </button>

                        <button 
                            className="btn-spotify" 
                            onClick={() => {
                                console.log('[Spotify] Next button clicked');
                                onNextSong();
                            }}
                            disabled={!playerReady}
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

            {/* Error display section */}
            {playerError && (
                <div className="player-error">
                    <h3>Player Error</h3>
                    <p>{playerError}</p>
                    <button 
                        className="btn-spotify" 
                        onClick={() => {
                            setPlayerError(null);
                            // Attempt to reconnect
                            if (playerRef.current) {
                                playerRef.current.connect()
                                    .then(() => {
                                        console.log('[Spotify] Reconnection successful');
                                        setPlayerReady(true);
                                    })
                                    .catch(error => {
                                        console.error('[Spotify] Reconnection failed:', error);
                                    });
                            }
                        }}
                    >
                        Retry Connection
                    </button>
                </div>
            )}
        </div>
    );
}

export default WebPlayback;