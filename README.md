# TopTrack - Collaborative Music Queue

A real-time music voting app where users can join rooms, add Spotify songs to a queue, and vote for their favorites. The songs with the most votes play first!

## Features

- **Room System**: Create or join music rooms with unique IDs
- **Spotify Integration**: Host plays music through Spotify Premium
- **Democratic Queue**: Songs with most votes play first
- **Real-time Updates**: Live queue and vote updates using Socket.IO
- **One Vote Per User**: Each user can vote for one song at a time

## Tech Stack

**Backend:**
- Flask (Python)
- Flask-SocketIO
- SQLite
- SQLAlchemy

**Frontend:**
- React.js
- Socket.IO Client
- Spotify Web Playback SDK

## Quick Start

### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## Usage

1. **Host a Room**:
   - Connect with Spotify Premium
   - Create a new room
   - Share room ID with friends

2. **Join a Room**:
   - Enter room ID
   - Add your name
   - Start participating!

3. **Add Songs**:
   - Paste Spotify track links
   - Songs appear in the queue

4. **Vote System**:
   - One vote per user
   - Change your vote anytime
   - Most voted songs play first

## Contributing

Pull requests are welcome! For major changes, please open an issue first.

## License

MIT License - See LICENSE file for details