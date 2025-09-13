# 🎮 Guessing Game — Multiplayer with Node.js, Socket.IO & React

A real-time multiplayer guessing game built with **Node.js**, **Socket.IO**, and **React (Vite)**. One player is randomly assigned as the **Game Master**, who sets the question and answer. Other players try to guess within a time limit.  

---

## ✨ Features
- Minimum **3 players** per session  
- Random Game Master selection  
- Game Master sets a **question + answer**  
- Players have **3 attempts** each  
- **60s timer** per round (default)  
- Correct guess = **+10 points**  
- Scores tracked live  
- New players cannot join mid-game  
- Game Master rotates each round  

---

## 📂 Project Structure
```bash
guessing-game/
├─ server/ # Backend (Node.js + Socket.IO)
│ ├─ package.json
│ └─ server.js
└─ client/ # Frontend (React + Vite)
├─ package.json
└─ src/
├─ main.jsx
└─ App.jsx
```

## ⚙️ Setup & Run

### 1. Server

```bash
cd server
npm install
npm run dev   # or: npm start
```
Runs on: http://localhost:4000

### 2. Client

```bash
cd client
npm install
npm run dev
```
Runs on: http://localhost:5173

### 3. Run both together (optional)

- At the project root directory, run:

```bash
npm install concurrently --save-dev
```
Then add to root package.json:

```bash
"scripts": {
  "start": "concurrently \"npm run server\" \"npm run client\"",
  "server": "cd server && nodemon server.js",
  "client": "cd client && npm run dev"
}
```

Then run

```bash
npm start
```

