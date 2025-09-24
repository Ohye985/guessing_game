const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require("dotenv").config();
const path = require("path");

const app = express();

// serve built React (only in production)
// app.use(express.static(path.join(__dirname, '../client/dist')));
app.use(cors());



const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
// const io = new Server(server, { cors: { origin: ['https://guessing-game-altschool.netlify.app/','http://localhost:5173'], methods: ['GET','POST'] }});


const PORT = process.env.PORT || 4000;

// In-memory sessions map: sessionId -> session object
const sessions = {};

function createSession(sessionId) {
  sessions[sessionId] = {
    id: sessionId,
    players: [], // { id, name, score, attemptsLeft }
    gameMasterId: null,
    state: 'waiting', // 'waiting' | 'in_progress'
    question: null, // { text, answer }
    timeLeft: 0,
    intervalRef: null,
    timeoutRef: null
  };
  return sessions[sessionId];
}

function pickRandomPlayer(players, excludeId) {
  const candidates = players.filter(p => p.id !== excludeId);
  if (candidates.length === 0) {
    return players.length ? players[Math.floor(Math.random() * players.length)].id : null;
  }
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join_session', ({ sessionId, name }, callback) => {
    if (!sessionId || !name) {
      return callback && callback({ status: 'error', message: 'sessionId and name required' });
    }

    let session = sessions[sessionId] || createSession(sessionId);

    if (session.state === 'in_progress') {
      return callback && callback({ status: 'error', message: 'Cannot join while game in progress' });
    }

    const player = { id: socket.id, name, score: 0, attemptsLeft: 3 };
    session.players.push(player);

    socket.join(sessionId);
    socket.data.sessionId = sessionId;
    socket.data.name = name;

    // assign game master if none exists and we have >= 3 players
    if (!session.gameMasterId && session.players.length >= 3) {
      const gmId = session.players[Math.floor(Math.random() * session.players.length)].id;
      session.gameMasterId = gmId;
    }

    io.to(sessionId).emit('session_update', {
      session: {
        id: session.id,
        players: session.players.map(p => ({ id: p.id, name: p.name, score: p.score, attemptsLeft: p.attemptsLeft }))
      },
      gameMasterId: session.gameMasterId,
      state: session.state
    });

    callback && callback({ status: 'ok', sessionId, playerId: socket.id, gameMasterId: session.gameMasterId });
  });

  socket.on('set_question', ({ sessionId, question, answer }, callback) => {
    const session = sessions[sessionId];
    if (!session) return callback && callback({ status: 'error', message: 'session not found' });
    if (socket.id !== session.gameMasterId) return callback && callback({ status: 'error', message: 'only game master can set question' });
    if (session.state === 'in_progress') return callback && callback({ status: 'error', message: 'game already in progress' });

    session.question = { text: question, answer: (answer || '').trim() };
    callback && callback({ status: 'ok' });
    socket.emit('question_set', { text: question });
  });

  socket.on('start_game', ({ sessionId, time }, callback) => {
    const session = sessions[sessionId];
    if (!session) return callback && callback({ status: 'error', message: 'session not found' });
    if (socket.id !== session.gameMasterId) return callback && callback({ status: 'error', message: 'only game master can start' });
    if (session.players.length < 3) return callback && callback({ status: 'error', message: 'need at least 3 players to start' });
    if (!session.question) return callback && callback({ status: 'error', message: 'no question set' });

    session.state = 'in_progress';
    session.timeLeft = typeof time === 'number' && time > 0 ? time : 60;

    // reset attempts
    session.players.forEach(p => p.attemptsLeft = 3);

    io.to(sessionId).emit('game_started', { question: session.question.text, timeLeft: session.timeLeft });

    // per-second ticks so clients may show countdown
    session.intervalRef = setInterval(() => {
      session.timeLeft -= 1;
      if (session.timeLeft >= 0) io.to(sessionId).emit('timer_tick', { timeLeft: session.timeLeft });
    }, 1000);

    // end of round when time is up
    session.timeoutRef = setTimeout(() => {
      if (session.intervalRef) { clearInterval(session.intervalRef); session.intervalRef = null; }
      session.state = 'waiting';
      const revealed = session.question ? session.question.answer : null;
      io.to(sessionId).emit('round_end', { winner: null, answer: revealed, reason: 'time_up' });
      session.question = null;
      session.gameMasterId = pickRandomPlayer(session.players, session.gameMasterId);
      io.to(sessionId).emit('session_update', {
        session: { id: session.id, players: session.players.map(p => ({ id: p.id, name: p.name, score: p.score })) },
        gameMasterId: session.gameMasterId,
        state: session.state
      });
    }, session.timeLeft * 1000);

    callback && callback({ status: 'ok' });
  });

  socket.on('submit_answer', ({ sessionId, guess }, callback) => {
    const session = sessions[sessionId];
    if (!session) return callback && callback({ status: 'error', message: 'session not found' });
    if (session.state !== 'in_progress') return callback && callback({ status: 'error', message: 'no game in progress' });

    const player = session.players.find(p => p.id === socket.id);
    if (!player) return callback && callback({ status: 'error', message: 'player not in session' });
    if (player.attemptsLeft <= 0) return callback && callback({ status: 'error', message: 'no attempts left' });

    player.attemptsLeft -= 1;

    io.to(sessionId).emit('player_attempt', { playerId: socket.id, name: player.name, attemptsLeft: player.attemptsLeft, guess });

    if (session.question && (guess || '').trim().toLowerCase() === session.question.answer.toLowerCase()) {
      // correct!
      player.score += 10;

      if (session.timeoutRef) { clearTimeout(session.timeoutRef); session.timeoutRef = null; }
      if (session.intervalRef) { clearInterval(session.intervalRef); session.intervalRef = null; }

      session.state = 'waiting';
      const winnerName = player.name;
      const answer = session.question.answer;

      io.to(sessionId).emit('round_end', { winner: { id: player.id, name: winnerName }, answer, reason: 'correct' });

      session.question = null;
      session.gameMasterId = pickRandomPlayer(session.players, session.gameMasterId);

      io.to(sessionId).emit('session_update', {
        session: { id: session.id, players: session.players.map(p => ({ id: p.id, name: p.name, score: p.score })) },
        gameMasterId: session.gameMasterId,
        state: session.state
      });

      return callback && callback({ status: 'ok', winner: true });
    }

    return callback && callback({ status: 'ok', attemptsLeft: player.attemptsLeft });
  });

  socket.on('leave_session', ({ sessionId }, callback) => {
    leaveSession(socket, sessionId);
    callback && callback({ status: 'ok' });
  });

  socket.on('disconnect', () => {
    const sessionId = socket.data.sessionId;
    if (sessionId) leaveSession(socket, sessionId);
    console.log('socket disconnected', socket.id);
  });

  function leaveSession(socket, sessionId) {
    const session = sessions[sessionId];
    if (!session) return;

    session.players = session.players.filter(p => p.id !== socket.id);
    socket.leave(sessionId);

    // if no players left, delete session
    if (session.players.length === 0) {
      if (session.timeoutRef) { clearTimeout(session.timeoutRef); }
      if (session.intervalRef) { clearInterval(session.intervalRef); }
      delete sessions[sessionId];
      return;
    }

    // if the game master left
    if (session.gameMasterId === socket.id) {
      // if a round was in progress, end it (no winner)
      if (session.state === 'in_progress') {
        if (session.timeoutRef) { clearTimeout(session.timeoutRef); session.timeoutRef = null; }
        if (session.intervalRef) { clearInterval(session.intervalRef); session.intervalRef = null; }
        session.state = 'waiting';
        const revealed = session.question ? session.question.answer : null;
        io.to(sessionId).emit('round_end', { winner: null, answer: revealed, reason: 'game_master_left' });
        session.question = null;
      }

      session.gameMasterId = pickRandomPlayer(session.players, socket.id);
    }

    io.to(sessionId).emit('session_update', {
      session: { id: session.id, players: session.players.map(p => ({ id: p.id, name: p.name, score: p.score })) },
      gameMasterId: session.gameMasterId,
      state: session.state
    });
  }
});

app.get('/', (req, res) => res.send('Guessing Game Server is running'));

// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/dist/index.html'));
// });

server.listen(PORT, () => console.log(`Server listening on ${PORT}`));