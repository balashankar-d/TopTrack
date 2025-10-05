from gevent import monkey
monkey.patch_all()
import logging
logging.basicConfig(level=logging.DEBUG)
from flask import Flask, request, jsonify, redirect,make_response
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
from flask_cors import CORS
from datetime import datetime, timedelta
import uuid
import os
import urllib.parse
from dotenv import load_dotenv
import requests

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///toptrack.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
# Spotify Configuration
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIFY_REDIRECT_URI")
SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing streaming user-read-email user-read-private"

CORS(app, 
     origins=['http://localhost:3000', 'http://127.0.0.1:3000'],
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
# Initialize extensions
db = SQLAlchemy(app)
socketio = SocketIO(app, 
                   cors_allowed_origins=['http://localhost:3000', 'http://127.0.0.1:3000'],async_mode="gevent"
                   )


# Database Models
class Room(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    host_id = db.Column(db.String(100), nullable=False)  # Spotify user ID
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    current_song_id = db.Column(db.String(36), db.ForeignKey('song.id'), nullable=True)
    
    # Relationships
    songs = db.relationship('Song', backref='room', lazy=True, foreign_keys='Song.room_id')
    
# Update your Song model to include new fields:

class Song(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id = db.Column(db.String(36), db.ForeignKey('room.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    artist = db.Column(db.String(200), nullable=False)
    album = db.Column(db.String(200), nullable=True)  # Add this
    spotify_url = db.Column(db.String(500), nullable=True)
    youtube_url = db.Column(db.String(500), nullable=True)
    spotify_track_id = db.Column(db.String(100), nullable=True)
    duration = db.Column(db.Integer, nullable=True)  # in seconds
    duration_ms = db.Column(db.Integer, nullable=True)  # Add this - in milliseconds
    image_url = db.Column(db.String(500), nullable=True)  # Add this
    preview_url = db.Column(db.String(500), nullable=True)  # Add this
    popularity = db.Column(db.Integer, nullable=True)  # Add this
    explicit = db.Column(db.Boolean, default=False, nullable=True)  # Add this
    added_by = db.Column(db.String(100), nullable=False)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    vote_count = db.Column(db.Integer, default=0)
    is_played = db.Column(db.Boolean, default=False)
    expires_at = db.Column(db.DateTime, nullable=True)
    
class Vote(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    song_id = db.Column(db.String(36), db.ForeignKey('song.id'), nullable=False)
    room_id = db.Column(db.String(36), db.ForeignKey('room.id'), nullable=False)  # Add this line
    user_id = db.Column(db.String(100), nullable=False)  # user identifier
    voted_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Ensure one vote per user per song per room
    __table_args__ = (db.UniqueConstraint('song_id', 'user_id', 'room_id', name='unique_vote'),)

class User(db.Model):
    id = db.Column(db.String(100), primary_key=True)  # user identifier (can be session-based)
    username = db.Column(db.String(50), nullable=False)
    is_online = db.Column(db.Boolean, default=True)
    current_room_id = db.Column(db.String(36), db.ForeignKey('room.id'), nullable=True)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)

class SpotifyToken(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    spotify_user_id = db.Column(db.String(100), unique=True, nullable=False)
    access_token = db.Column(db.Text, nullable=False)
    refresh_token = db.Column(db.Text, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# REST API Endpoints

# Spotify Authentication Endpoints
@app.route("/api/spotify-login")
def spotify_login():
    room_name = request.args.get('room_name', 'My Jam Session')
    auth_url = "https://accounts.spotify.com/authorize"
    params = {
        "client_id": SPOTIFY_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": "http://127.0.0.1:5000/callback",  # Updated to match callback
        "scope": SCOPES,
        "state": room_name  # Pass room name as state parameter
    }
    return jsonify({"url": f"{auth_url}?{urllib.parse.urlencode(params)}"})

@app.route('/callback', methods=['GET'])
def spotify_callback():
    import requests, base64
    
    # Check for errors from Spotify
    error = request.args.get('error')
    if error:
        error_description = request.args.get('error_description', 'Unknown error')
        print(f"Spotify auth error: {error} - {error_description}")
        return redirect(f"http://localhost:3000/create?error=spotify_error&message={error_description}")
    
    code = request.args.get('code')
    if not code:
        print("No authorization code received")
        return redirect(f"http://localhost:3000/create?error=missing_code&message=No authorization code received")

    redirect_uri = "http://127.0.0.1:5000/callback"

    try:
        auth_string = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
        auth_bytes = auth_string.encode('utf-8')
        auth_base64 = base64.b64encode(auth_bytes).decode('utf-8')
        
        print(f"Exchanging code for token...")
        token_response = requests.post(
            'https://accounts.spotify.com/api/token',
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirect_uri,
            },
            headers={
                'Authorization': f'Basic {auth_base64}',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout=10
        )
        
        if token_response.status_code != 200:
            print(f"Token exchange failed: {token_response.status_code} - {token_response.text}")
            return redirect(f"http://localhost:3000/create?error=token_failed&message=Failed to exchange code for token")
        
        token_data = token_response.json()
        print(f"Token received successfully")
        
        # Get user profile
        profile_response = requests.get(
            'https://api.spotify.com/v1/me',
            headers={'Authorization': f"Bearer {token_data['access_token']}"},
            timeout=10
        )
        
        if profile_response.status_code != 200:
            print(f"Profile fetch failed: {profile_response.status_code} - {profile_response.text}")
            return redirect(f"http://localhost:3000/create?error=profile_failed&message=Failed to get Spotify profile")
        
        profile_data = profile_response.json()
        spotify_user_id = profile_data['id']
        display_name = profile_data.get('display_name', profile_data.get('id', 'Spotify User'))
        
        print(f"User profile: {display_name} ({spotify_user_id})")
        
        # Store tokens
        from datetime import timedelta
        expires_at = datetime.utcnow() + timedelta(seconds=token_data['expires_in'])
        
        existing_token = SpotifyToken.query.filter_by(spotify_user_id=spotify_user_id).first()
        
        if existing_token:
            existing_token.access_token = token_data['access_token']
            existing_token.refresh_token = token_data['refresh_token']
            existing_token.expires_at = expires_at
            existing_token.updated_at = datetime.utcnow()
        else:
            new_token = SpotifyToken(
                spotify_user_id=spotify_user_id,
                access_token=token_data['access_token'],
                refresh_token=token_data['refresh_token'],
                expires_at=expires_at
            )
            db.session.add(new_token)
        
        db.session.commit()
        print(f"Tokens stored for user: {spotify_user_id}")
        
        # Create room
        room_name = request.args.get('state', 'My Jam Session')
        room = Room(
            name=room_name,
            host_id=spotify_user_id
        )
        db.session.add(room)
        db.session.commit()
        
        print(f"Room created: {room.id} - {room.name}")
        print(f"=== CALLBACK DEBUG ===")
        print(f"Room ID: {room.id}")
        print(f"Room Name: {room.name}")
        print(f"Spotify User: {spotify_user_id}")
        print(f"Display Name: {display_name}")

        final_url = f"http://localhost:3000/room/{room.id}?spotify_user={spotify_user_id}&display_name={display_name}&auth_success=true"
        print(f"Final redirect URL: {final_url}")
        print("=====================")

        return redirect(final_url)
        
        
        
    except Exception as e:
        print(f"Callback error: {str(e)}")
        # Sanitize error message for redirect
        error_message = str(e).replace('\n', ' ').replace('\r', ' ')
        return redirect(f"http://localhost:3000/create?error=server_error&message=Authentication failed: {error_message}")


@app.route('/api/spotify/track-info', methods=['POST'])
def get_spotify_track_info():
    import requests, base64
    from datetime import timedelta
    
    data = request.json
    spotify_url = data.get('spotify_url')
    room_id = data.get('room_id')
    added_by = data.get('added_by', 'Unknown User')
    
    if not spotify_url or 'spotify.com/track/' not in spotify_url:
        return jsonify({'error': 'Invalid Spotify URL'}), 400
    
    if not room_id:
        return jsonify({'error': 'Room ID is required'}), 400
    
    # Extract track ID from URL
    try:
        track_id = spotify_url.split('/track/')[1].split('?')[0]
        if not track_id:
            raise ValueError("Empty track ID")
    except (IndexError, AttributeError, ValueError):
        return jsonify({'error': 'Could not extract track ID from URL'}), 400
    
    # Check if song already exists in the room queue
    existing_song = Song.query.filter_by(
        room_id=room_id, 
        spotify_track_id=track_id, 
        is_played=False
    ).first()
    
    if existing_song:
        return jsonify({'error': 'This song is already in the queue'}), 400
    
    # Get room to find the host
    room = Room.query.filter_by(id=room_id).first()
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    
    # Get host's Spotify token
    spotify_token = SpotifyToken.query.filter_by(spotify_user_id=room.host_id).first()
    if not spotify_token:
        return jsonify({'error': 'Room host not authenticated with Spotify'}), 401
    
    # Check if token is expired and refresh if needed
    if datetime.utcnow() >= spotify_token.expires_at:
        print(f"Token expired for user {room.host_id}, attempting refresh...")
        refreshed = refresh_spotify_token(spotify_token)
        if not refreshed:
            return jsonify({'error': 'Failed to refresh Spotify token. Host may need to re-authenticate.'}), 401
    
    # Call Spotify API to get track info
    try:
        print(f"Fetching track info for: {track_id}")
        track_response = requests.get(
            f'https://api.spotify.com/v1/tracks/{track_id}',
            headers={'Authorization': f'Bearer {spotify_token.access_token}'},
            timeout=10
        )
        
        if track_response.status_code == 200:
            track_data = track_response.json()
            now = datetime.utcnow()
            expires_at = now + timedelta(hours=1)  # Song expires in 1 hour
            # Create new song record with all required fields
            new_song = Song(
                room_id=room_id,
                title=track_data['name'],
                artist=', '.join([artist['name'] for artist in track_data['artists']]),
                album=track_data['album']['name'],
                spotify_url=spotify_url,
                spotify_track_id=track_id,
                duration_ms=track_data['duration_ms'],
                duration=track_data['duration_ms'] // 1000,
                image_url=track_data['album']['images'][0]['url'] if track_data['album']['images'] else None,
                preview_url=track_data.get('preview_url'),
                popularity=track_data.get('popularity', 0),
                explicit=track_data.get('explicit', False),
                added_by=added_by,
                added_at=now,
                vote_count=0,
                is_played=False,
                expires_at=expires_at,
                youtube_url=None
            )
            db.session.add(new_song)
            db.session.commit()
            print(f"Song added to queue: {new_song.title} by {new_song.artist}")
            # Emit to all room members that a song was added
            socketio.emit('song_added', {
                'song': {
                    'id': new_song.id,
                    'room_id': new_song.room_id,
                    'title': new_song.title,
                    'artist': new_song.artist,
                    'album': new_song.album,
                    'spotify_url': new_song.spotify_url,
                    'spotify_track_id': new_song.spotify_track_id,
                    'duration': new_song.duration,
                    'duration_ms': new_song.duration_ms,
                    'image_url': new_song.image_url,
                    'preview_url': new_song.preview_url,
                    'popularity': new_song.popularity,
                    'explicit': new_song.explicit,
                    'added_by': new_song.added_by,
                    'added_at': new_song.added_at.isoformat(),
                    'vote_count': new_song.vote_count,
                    'is_played': new_song.is_played,
                    'expires_at': new_song.expires_at.isoformat(),
                    'youtube_url': new_song.youtube_url
                },
                'message': f'{added_by} added "{new_song.title}" by {new_song.artist} to the queue'
            }, room=room_id)
            # Return success response
            return jsonify({
                'success': True,
                'message': 'Song added to queue successfully',
                'song': {
                    'id': new_song.id,
                    'room_id': new_song.room_id,
                    'title': new_song.title,
                    'artist': new_song.artist,
                    'album': new_song.album,
                    'spotify_url': new_song.spotify_url,
                    'spotify_track_id': new_song.spotify_track_id,
                    'duration': new_song.duration,
                    'duration_ms': new_song.duration_ms,
                    'image_url': new_song.image_url,
                    'preview_url': new_song.preview_url,
                    'popularity': new_song.popularity,
                    'explicit': new_song.explicit,
                    'added_by': new_song.added_by,
                    'added_at': new_song.added_at.isoformat(),
                    'vote_count': new_song.vote_count,
                    'is_played': new_song.is_played,
                    'expires_at': new_song.expires_at.isoformat(),
                    'youtube_url': new_song.youtube_url
                }
            }), 201
        elif track_response.status_code == 401:
            print("Access token invalid, attempting refresh...")
            refreshed = refresh_spotify_token(spotify_token)
            if refreshed:
                track_response = requests.get(
                    f'https://api.spotify.com/v1/tracks/{track_id}',
                    headers={'Authorization': f'Bearer {spotify_token.access_token}'},
                    timeout=10
                )
                if track_response.status_code == 200:
                    track_data = track_response.json()
                    now = datetime.utcnow()
                    expires_at = now + timedelta(hours=1)
                    new_song = Song(
                        room_id=room_id,
                        title=track_data['name'],
                        artist=', '.join([artist['name'] for artist in track_data['artists']]),
                        album=track_data['album']['name'],
                        spotify_url=spotify_url,
                        spotify_track_id=track_id,
                        duration_ms=track_data['duration_ms'],
                        duration=track_data['duration_ms'] // 1000,
                        image_url=track_data['album']['images'][0]['url'] if track_data['album']['images'] else None,
                        preview_url=track_data.get('preview_url'),
                        popularity=track_data.get('popularity', 0),
                        explicit=track_data.get('explicit', False),
                        added_by=added_by,
                        added_at=now,
                        vote_count=0,
                        is_played=False,
                        expires_at=expires_at,
                        youtube_url=None
                    )
                    db.session.add(new_song)
                    db.session.commit()
                    socketio.emit('song_added', {
                        'song': {
                            'id': new_song.id,
                            'room_id': new_song.room_id,
                            'title': new_song.title,
                            'artist': new_song.artist,
                            'album': new_song.album,
                            'spotify_url': new_song.spotify_url,
                            'spotify_track_id': new_song.spotify_track_id,
                            'duration': new_song.duration,
                            'duration_ms': new_song.duration_ms,
                            'image_url': new_song.image_url,
                            'preview_url': new_song.preview_url,
                            'popularity': new_song.popularity,
                            'explicit': new_song.explicit,
                            'added_by': new_song.added_by,
                            'added_at': new_song.added_at.isoformat(),
                            'vote_count': new_song.vote_count,
                            'is_played': new_song.is_played,
                            'expires_at': new_song.expires_at.isoformat(),
                            'youtube_url': new_song.youtube_url
                        },
                        'message': f'{added_by} added "{new_song.title}" by {new_song.artist} to the queue'
                    }, room=room_id)
                    return jsonify({
                        'success': True,
                        'message': 'Song added to queue successfully',
                        'song': {
                            'id': new_song.id,
                            'room_id': new_song.room_id,
                            'title': new_song.title,
                            'artist': new_song.artist,
                            'album': new_song.album,
                            'spotify_url': new_song.spotify_url,
                            'spotify_track_id': new_song.spotify_track_id,
                            'duration': new_song.duration,
                            'duration_ms': new_song.duration_ms,
                            'image_url': new_song.image_url,
                            'preview_url': new_song.preview_url,
                            'popularity': new_song.popularity,
                            'explicit': new_song.explicit,
                            'added_by': new_song.added_by,
                            'added_at': new_song.added_at.isoformat(),
                            'vote_count': new_song.vote_count,
                            'is_played': new_song.is_played,
                            'expires_at': new_song.expires_at.isoformat(),
                            'youtube_url': new_song.youtube_url
                        }
                    }), 201
            return jsonify({'error': 'Authentication failed. Host may need to re-authenticate with Spotify.'}), 401
        elif track_response.status_code == 404:
            return jsonify({'error': 'Track not found on Spotify'}), 404
        elif track_response.status_code == 429:
            return jsonify({'error': 'Spotify API rate limit exceeded. Please try again later.'}), 429
        else:
            print(f"Spotify API error: {track_response.status_code} - {track_response.text}")
            return jsonify({'error': f'Spotify API error: {track_response.status_code}'}), 400
    except requests.exceptions.Timeout:
        print("Spotify API request timed out")
        return jsonify({'error': 'Request to Spotify timed out. Please try again.'}), 408
    except requests.exceptions.RequestException as e:
        print(f"Network error when calling Spotify API: {str(e)}")
        return jsonify({'error': 'Network error when fetching track info'}), 500
    except Exception as e:
        print(f"Unexpected error fetching track info: {str(e)}")
        return jsonify({'error': 'Failed to fetch track information'}), 500

def refresh_spotify_token(spotify_token):
    """Refresh expired Spotify access token"""
    import requests, base64
    
    try:
        print(f"Refreshing token for user: {spotify_token.spotify_user_id}")
        
        auth_string = f"{SPOTIFY_CLIENT_ID}:{SPOTIFY_CLIENT_SECRET}"
        auth_bytes = auth_string.encode('utf-8')
        auth_base64 = base64.b64encode(auth_bytes).decode('utf-8')
        
        refresh_response = requests.post(
            'https://accounts.spotify.com/api/token',
            data={
                'grant_type': 'refresh_token',
                'refresh_token': spotify_token.refresh_token,
            },
            headers={
                'Authorization': f'Basic {auth_base64}',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout=10
        )
        
        if refresh_response.status_code == 200:
            token_data = refresh_response.json()
            
            # Update token in database
            from datetime import timedelta
            spotify_token.access_token = token_data['access_token']
            spotify_token.expires_at = datetime.utcnow() + timedelta(seconds=token_data['expires_in'])
            spotify_token.updated_at = datetime.utcnow()
            
            # Update refresh token if provided (Spotify sometimes provides new one)
            if 'refresh_token' in token_data:
                spotify_token.refresh_token = token_data['refresh_token']
            
            db.session.commit()
            print(f"Token refreshed successfully for user: {spotify_token.spotify_user_id}")
            return True
        else:
            print(f"Token refresh failed: {refresh_response.status_code} - {refresh_response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("Token refresh request timed out")
        return False
        
    except requests.exceptions.RequestException as e:
        print(f"Network error during token refresh: {str(e)}")
        return False
        
    except Exception as e:
        print(f"Unexpected error refreshing token: {str(e)}")
        return False


@socketio.on('connect')
def handle_connect():
    print(f"[Socket.IO] Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"[Socket.IO] Client disconnected: {request.sid}")

@socketio.on('join_room')
def handle_join_room(data):
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    join_room(room_id)
    print(f"User {user_id} joined room {room_id}")
    emit('user_joined', {'user_id': user_id, 'room_id': room_id}, room=room_id)

@socketio.on('leave_room')
def handle_leave_room(data):
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    leave_room(room_id)
    print(f"User {user_id} left room {room_id}")
    emit('user_left', {'user_id': user_id, 'room_id': room_id}, room=room_id)

@socketio.on('send_message')
def handle_send_message(data):
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    message = data.get('message')
    print(f"User {user_id} sent message to room {room_id}: {message}")
    emit('receive_message', {'user_id': user_id, 'room_id': room_id, 'message': message}, room=room_id)

@socketio.on('vote_song')
def handle_vote_song(data):
    room_id = data.get('room_id')
    song_id = data.get('song_id')
    user_id = data.get('user_id')
    vote_type = data.get('vote_type', 'up')  # 'up' or 'down'
    
    # Only allow one vote per user per room (switch vote to new song)
    # Remove previous vote by this user in this room (if any)
    previous_vote = Vote.query.filter_by(room_id=room_id, user_id=user_id).first()
    changed = False
    if previous_vote:
        if previous_vote.song_id != song_id:
            # Decrement vote count for previous song
            prev_song = Song.query.filter_by(id=previous_vote.song_id).first()
            if prev_song and prev_song.vote_count > 0:
                prev_song.vote_count -= 1
            db.session.delete(previous_vote)
            changed = True
            emit('song_voted', {'user_id': user_id, 'room_id': room_id, 'song_id': prev_song.id, 'vote_type': 'removed', 'vote_count': prev_song.vote_count if prev_song else 0}, room=room_id)
        elif previous_vote.song_id == song_id:
            # If voting for same song, remove vote (toggle off)
            song = Song.query.filter_by(id=song_id).first()
            if song and song.vote_count > 0:
                song.vote_count -= 1
            db.session.delete(previous_vote)
            db.session.commit()
            print(f"User {user_id} removed vote from song {song_id} in room {room_id}")
            emit('song_voted', {'user_id': user_id, 'room_id': room_id, 'song_id': song_id, 'vote_type': 'removed', 'vote_count': song.vote_count if song else 0}, room=room_id)
            return
    # Add new vote if not toggling off
    if not previous_vote or changed:
        new_vote = Vote(song_id=song_id, room_id=room_id, user_id=user_id)
        song = Song.query.filter_by(id=song_id).first()
        if song:
            song.vote_count += 1
        db.session.add(new_vote)
        db.session.commit()
        print(f"User {user_id} voted {vote_type} on song {song_id} in room {room_id}")
        emit('song_voted', {'user_id': user_id, 'room_id': room_id, 'song_id': song_id, 'vote_type': vote_type, 'vote_count': song.vote_count if song else 0}, room=room_id)

@socketio.on('play_song')
def handle_play_song(data):
    room_id = data.get('room_id')
    song_id = data.get('song_id')
    user_id = data.get('user_id')
    print(f"User {user_id} requested to play song {song_id} in room {room_id}")
    emit('song_played', {'user_id': user_id, 'room_id': room_id, 'song_id': song_id}, room=room_id)

@socketio.on('get_next_song')
def handle_get_next_song(data):
    room_id = data.get('room_id')
    user_id = data.get('user_id')
    print(f"User {user_id} requested next song in room {room_id}")
    
    from datetime import datetime
    now = datetime.utcnow()
    # Fetch next song: not played, not expired, highest votes, newest added
    next_song = Song.query.filter_by(room_id=room_id, is_played=False)
    next_song = next_song.filter((Song.expires_at == None) | (Song.expires_at > now))
    next_song = next_song.order_by(Song.vote_count.desc(), Song.added_at.desc()).first()
    
    if next_song:
        # Mark as played
        next_song.is_played = True
        db.session.commit()
        print(f"Next song for room {room_id} is {next_song.title} by {next_song.artist}")
        emit('next_song', {
            'current_song': {
                'id': next_song.id,
                'room_id': next_song.room_id,
                'title': next_song.title,
                'artist': next_song.artist,
                'album': next_song.album,
                'spotify_url': next_song.spotify_url,
                'spotify_track_id': next_song.spotify_track_id,
                'duration': next_song.duration,
                'duration_ms': next_song.duration_ms,
                'image_url': next_song.image_url,
                'preview_url': next_song.preview_url,
                'popularity': next_song.popularity,
                'explicit': next_song.explicit,
                'added_by': next_song.added_by,
                'added_at': next_song.added_at.isoformat(),
                'vote_count': next_song.vote_count,
                'is_played': next_song.is_played,
                'expires_at': next_song.expires_at.isoformat() if next_song.expires_at else None,
                'youtube_url': next_song.youtube_url
            }
        }, room=room_id)
        emit('song_removed', {'song_id': next_song.id, 'room_id': room_id}, room=room_id)
    else:
        print(f"No more songs in queue for room {room_id}")
        emit('next_song', {'song': None}, room=room_id)

@app.route('/api/rooms/<room_id>', methods=['GET'])
def get_room(room_id):
    try:
        # Query the room from database
        room = Room.query.get(room_id)
        
        if not room:
            return jsonify({
                'error': 'Room not found'
            }), 404
            
        return jsonify({
            'room': {
                'id': room.id,
                'name': room.name,
                'host_id': room.host_id,
                'is_active': room.is_active,
                'created_at': room.created_at.isoformat(),
                'current_song_id': room.current_song_id
            }
        })
        
    except Exception as e:
        print(f"Error getting room details: {str(e)}")
        return jsonify({
            'error': 'Failed to get room details'
        }), 500


@app.route('/api/room/<room_id>/queue', methods=['GET'])
def get_room_queue(room_id):
    from datetime import datetime
    # Fetch up to 10 songs not played, not expired, ordered by votes DESC, then newest added_at DESC
    now = datetime.utcnow()
    songs = Song.query.filter_by(room_id=room_id, is_played=False)
    songs = songs.filter((Song.expires_at == None) | (Song.expires_at > now))
    songs = songs.order_by(Song.vote_count.desc(), Song.added_at.desc()).limit(10).all()
    song_list = []
    for song in songs:
        song_list.append({
            'id': song.id,
            'room_id': song.room_id,
            'title': song.title,
            'artist': song.artist,
            'album': song.album,
            'spotify_url': song.spotify_url,
            'spotify_track_id': song.spotify_track_id,
            'duration': song.duration,
            'duration_ms': song.duration_ms,
            'image_url': song.image_url,
            'preview_url': song.preview_url,
            'popularity': song.popularity,
            'explicit': song.explicit,
            'added_by': song.added_by,
            'added_at': song.added_at.isoformat() if song.added_at else None,
            'vote_count': song.vote_count,
            'is_played': song.is_played,
            'expires_at': song.expires_at.isoformat() if song.expires_at else None
        })
    return jsonify({'songs': song_list})


@app.route('/api/spotify/token/room/<room_id>', methods=['GET'])
def get_room_spotify_token(room_id):
    # First get the room to find the host
    room = Room.query.filter_by(id=room_id).first()
    if not room:
        return jsonify({'error': 'Room not found'}), 404
    
    # Get the host's Spotify token
    spotify_token = SpotifyToken.query.filter_by(spotify_user_id=room.host_id).first()
    if not spotify_token:
        return jsonify({'error': 'No token found for room host'}), 404
    
    # Check if token needs refresh (expires in less than 5 minutes)
    if datetime.utcnow() >= spotify_token.expires_at - timedelta(minutes=5):
        # Use existing refresh function
        if not refresh_spotify_token(spotify_token):
            return jsonify({'error': 'Failed to refresh token'}), 500
    
    return jsonify({
        'access_token': spotify_token.access_token,
        'expires_in': int((spotify_token.expires_at - datetime.utcnow()).total_seconds())
    })


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
