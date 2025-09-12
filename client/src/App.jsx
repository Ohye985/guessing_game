import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css"

// Change if your server runs on a different host/port
// const SERVER_URL = "http://localhost:4000";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;




export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("room1");

  const [players, setPlayers] = useState([]);
  const [gameMasterId, setGameMasterId] = useState(null);
  const [isGameMaster, setIsGameMaster] = useState(false);
  const [gameState, setGameState] = useState("waiting");

  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [myAttempts, setMyAttempts] = useState(3);
  const [messages, setMessages] = useState([]);
  const guessRef = useRef("");

  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket]);

  function addMessage(msg) {
    setMessages((prev) => [
      ...prev,
      { ...msg, ts: new Date().toLocaleTimeString() },
    ]);
  }

  function join() {
    if (!name || !sessionId) return alert("Enter name and session id");
    const chat = io(SERVER_URL);
    setSocket(chat);

    chat.on("connect", () => {
      chat.emit("join_session", { sessionId, name }, (res) => {
        if (res.status === "ok") {
          setConnected(true);
          addMessage({ system: true, text: `You joined ${sessionId}` });
        } else {
          addMessage({ system: true, text: `Join failed: ${res.message}` });
        }
      });
    });

    chat.on("session_update", ({ session, gameMasterId, state }) => {
      setPlayers(session.players);
      setGameMasterId(gameMasterId);
      setGameState(state);
      setIsGameMaster(gameMasterId === chat.id);
      const me = session.players.find((p) => p.id === chat.id);
      setMyAttempts(me ? me.attemptsLeft ?? 3 : 3);
    });

    chat.on("question_set", () =>
      addMessage({ system: true, text: "Game master set a new question" })
    );

    chat.on("game_started", ({ question, timeLeft }) => {
      setCurrentQuestion(question);
      setTimeLeft(timeLeft);
      addMessage({
        system: true,
        text: `Game started — question: ${question}`,
      });
    });

    chat.on("timer_tick", ({ timeLeft }) => setTimeLeft(timeLeft));

    chat.on("player_attempt", ({ playerId, name, attemptsLeft, guess }) => {
      addMessage({
        system: false,
        text: `${name} guessed: "${guess}" (${attemptsLeft} attempts left)`,
      });
      if (playerId === chat.id) setMyAttempts(attemptsLeft);
    });

    chat.on("round_end", ({ winner, answer, reason }) => {
      if (winner)
        addMessage({
          system: true,
          text: `${winner.name} won! Answer: ${answer}`,
        });
      else
        addMessage({
          system: true,
          text: `Round ended (${reason}). Answer: ${answer}`,
        });
      setCurrentQuestion(null);
    });

    chat.on("disconnect", () => {
      setConnected(false);
      addMessage({ system: true, text: "Disconnected from server" });
    });
  }

  function setQuestionOnServer() {
    if (!socket) return;
    socket.emit(
      "set_question",
      { sessionId, question: questionText, answer: answerText },
      (res) => {
        if (res.status === "ok")
          addMessage({ system: true, text: "Question saved" });
        else
          addMessage({
            system: true,
            text: "Set question failed: " + res.message,
          });
      }
    );
  }

  function startGameOnServer() {
    if (!socket) return;
    socket.emit("start_game", { sessionId, time: 60 }, (res) => {
      if (res.status === "ok")
        addMessage({ system: true, text: "Game started" });
      else addMessage({ system: true, text: "Start failed: " + res.message });
    });
  }

  function submitGuess() {
    if (!socket) return;
    const guess = guessRef.current.value;
    if (!guess) return;
    socket.emit("submit_answer", { sessionId, guess }, (res) => {
      if (res && res.status === "error")
        addMessage({ system: true, text: "Guess error: " + res.message });
      guessRef.current.value = "";
    });
  }

  function leave() {
    if (!socket) return;
    socket.emit("leave_session", { sessionId }, () => {
      socket.disconnect();
      setSocket(null);
      setConnected(false);
      setPlayers([]);
      addMessage({ system: true, text: "You left the session" });
    });
  }

  return (
    <div
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: 16,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>Guessing Game (React + Socket.IO)</h1>

      {!connected && (
        <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
          <input style={{padding: 5, borderRadius: 8, border: "2px solid rgb(74, 72, 72)"}}
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input style={{padding: 5, borderRadius: 8, border: "2px solid rgb(74, 72, 72)"}}
            placeholder="Session id (e.g. room1)"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
          <button onClick={join}>Join Session</button>
        </div>
      )}

      {connected && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "300px 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          <div
            style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}
          >
            <h3>Players ({players.length})</h3>
            <ul>
              {players.map((p) => (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  <strong>{p.name}</strong>{" "}
                  {p.id === gameMasterId && <em>(Game Master)</em>} — {p.score}{" "}
                  pts
                </li>
              ))}
            </ul>

            <div style={{ marginTop: 12 }}>
              <div>
                State: <strong>{gameState}</strong>
              </div>
              <div>
                Time left: <strong>{timeLeft}s</strong>
              </div>
              <div>
                Your attempts: <strong>{myAttempts}</strong>
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={leave}>Leave Session</button>
              </div>
            </div>

            {isGameMaster && (
              <div style={{ marginTop: 12 }}>
                <h4>Game Master controls</h4>
                <div style={{display: "flex", flexDirection: "column", gap: 4}}>
                  <input style={{padding: 5, borderRadius: 2, border: "1px solid rgb(74, 72, 72)"}}
                  placeholder="Question text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                />
                <input style={{padding: 5, borderRadius: 2, border: "1px solid rgb(74, 72, 72)"}}
                  placeholder="Answer (hidden)"
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                />
                </div>
                
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <button onClick={setQuestionOnServer}>Save question</button>
                  <button onClick={startGameOnServer}>Start game (60s)</button>
                </div>
              </div>
            )}
          </div>

          <div
            style={{ border: "1px solid #eee", padding: 12, borderRadius: 8 }}
          >
            <div
              style={{
                height: 360,
                overflowY: "auto",
                border: "1px solid #f0f0f0",
                padding: 8,
                borderRadius: 6,
              }}
            >
              {messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>{m.ts}</div>
                  <div>{m.system ? <em>{m.text}</em> : m.text}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              {currentQuestion ? (
                <div>
                  <div>
                    <strong>Question:</strong> {currentQuestion}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <input style={{padding: 10, borderRadius: 8, border: "1px solid rgb(74, 72, 72)", margin: 12}} placeholder="Your guess" ref={guessRef} />
                    <button onClick={submitGuess}>Submit guess</button>
                  </div>
                </div>
              ) : (
                <div>
                  <em>Waiting for next round...</em>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
