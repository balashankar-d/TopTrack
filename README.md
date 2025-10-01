# TopTrack - Music Jam Session App

A real-time music collaboration app where users can create rooms, add songs to a queue, and vote for their favorites.

## Features

- **Create Rooms**: Host can create a room with Spotify Premium
- **Join Rooms**: Anyone can join using room ID or link
- **Add Songs**: Paste Spotify/YouTube links to add to queue
- **Voting System**: Democratic song selection through voting
- **Real-time Updates**: Live queue updates and chat
- **Role-based Controls**: Host controls playback, members can vote and add songs

## Tech Stack

**Backend:**
- Flask (Python web framework)
- Flask-SocketIO (Real-time communication)
- PostgreSQL (Database)
- SQLAlchemy (ORM)

**Frontend:**
- React.js
- Socket.IO Client
- React Router
- Axios

## Setup Instructions

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up PostgreSQL database:
```bash
# Create database named 'toptrack_db'
# Update .env file with your database credentials
```

5. Initialize database:
```bash
python app.py
```

6. Run the server:
```bash
python app.py
```

The backend will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## API Endpoints

### REST API
- `POST /api/rooms` - Create a new room
- `GET /api/rooms/<room_id>` - Get room details and queue
- `POST /api/rooms/<room_id>/songs` - Add song to queue
- `POST /api/songs/<song_id>/vote` - Vote for a song

### SocketIO Events

**Client to Server:**
- `join_room` - Join a room
- `leave_room` - Leave a room
- `add_song` - Add song to queue
- `vote_song` - Vote for a song
- `play_next_song` - Play next song (host only)
- `send_message` - Send chat message

**Server to Client:**
- `room_joined` - Confirm room join
- `queue_updated` - Updated song queue
- `song_changed` - Current song changed
- `vote_updated` - Vote count updated
- `user_joined` - User joined room
- `user_left` - User left room

## Database Schema

### Tables
- **Room**: Room information and settings
- **Song**: Song details and metadata
- **Vote**: User votes for songs
- **User**: User information and session data

## Usage

1. **Create a Room**: 
   - Go to homepage
   - Click "Create Room"
   - Enter room name
   - Connect with Spotify Premium (or use demo mode)

2. **Join a Room**:
   - Go to homepage
   - Click "Join Room"
   - Enter your name and room ID/link

3. **Add Songs**:
   - Paste Spotify or YouTube links
   - Songs are added to the queue

4. **Vote for Songs**:
   - Click the vote button on any song
   - Songs with more votes play first

5. **Control Playback** (Host only):
   - Click "Next Song" to skip to next track
   - Pause/resume playback

## Future Enhancements

- Spotify Web API integration for full playback control
- YouTube API integration
- User authentication and profiles
- Room persistence and history
- Mobile app
- Advanced voting mechanisms
- Playlist exports

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
