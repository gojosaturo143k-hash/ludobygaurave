// server.js
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log("🟢 Ludo server running on port", PORT);

// rooms data
const rooms = {};

// helper: broadcast to room
function broadcast(roomCode, data) {
    rooms[roomCode].players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(data));
        }
    });
}

// helper: get current player
function currentPlayer(room) {
    return room.players[room.turn];
}

wss.on("connection", (ws) => {

    ws.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg);
        } catch (e) {
            return;
        }

        // 🔵 JOIN ROOM
        if (data.type === "JOIN_ROOM") {
            const { name, room, color } = data;

            if (!rooms[room]) {
                rooms[room] = {
                    players: [],
                    turn: 0
                };
            }

            const roomObj = rooms[room];

            // room full
            if (roomObj.players.length >= 4) {
                ws.send(JSON.stringify({
                    type: "ROOM_FULL"
                }));
                return;
            }

            // color already taken
            if (roomObj.players.find(p => p.color === color)) {
                ws.send(JSON.stringify({
                    type: "ERROR",
                    message: "Color already taken"
                }));
                return;
            }

            // add player
            const player = {
                ws,
                name,
                color
            };

            roomObj.players.push(player);
            ws.room = room;

            ws.send(JSON.stringify({
                type: "JOIN_SUCCESS",
                color: color
            }));

            // notify others
            broadcast(room, {
                type: "PLAYER_JOINED",
                name,
                color
            });

            // start game if 2 players
            if (roomObj.players.length >= 2) {
                broadcast(room, {
                    type: "GAME_READY",
                    turn: roomObj.players[roomObj.turn].color
                });
            }
        }

        // 🎲 ROLL DICE
        if (data.type === "ROLL_DICE") {
            const room = rooms[ws.room];
            if (!room) return;

            const player = currentPlayer(room);

            // only current turn can roll
            if (player.ws !== ws) return;

            const dice = Math.floor(Math.random() * 6) + 1;

            broadcast(ws.room, {
                type: "DICE_RESULT",
                value: dice,
                color: player.color
            });
        }

        // 🧍 TOKEN MOVE DONE
        if (data.type === "MOVE_DONE") {
            const room = rooms[ws.room];
            if (!room) return;

            // next turn
            room.turn = (room.turn + 1) % room.players.length;

            broadcast(ws.room, {
                type: "NEXT_TURN",
                turn: room.players[room.turn].color
            });
        }
    });

    ws.on("close", () => {
        const roomCode = ws.room;
        if (!roomCode || !rooms[roomCode]) return;

        const room = rooms[roomCode];
        room.players = room.players.filter(p => p.ws !== ws);

        // reset turn if needed
        if (room.turn >= room.players.length) {
            room.turn = 0;
        }

        if (room.players.length === 0) {
            delete rooms[roomCode];
        }
    });
});