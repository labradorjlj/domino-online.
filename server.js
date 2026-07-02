const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const rooms = {};

function criarBaralho() {
    const pedras = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            pedras.push({ ladoA: i, ladoB: j });
        }
    }
    return pedras.sort(() => Math.random() - 0.5);
}

function iniciarRodadaOficial(room, baralhoGerado, jogadorInicialId) {
    room.gameState = 'playing';
    room.mesa = [];
    room.pontas = [-1, -1];
    
    room.turnoAtual = room.players.findIndex(p => p.id === jogadorInicialId);
    
    room.players.forEach((player, index) => {
        player.hand = baralhoGerado.slice(index * 7, (index + 1) * 7);
        io.to(player.id).emit('receiveHand', player.hand);
    });

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: jogadorInicialId,
        score: room.score
    });
}

io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('roomUpdated', {
                    players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
                    count: room.players.length
                });
                if (room.gameState !== 'lobby') {
                    room.gameState = 'lobby';
                    room.votes = { '6-6': 0, '1-1': 0, votedCount: 0 };
                    io.to(roomId).emit('errorMsg', 'Um jogador desconectou. Voltando ao lobby.');
                }
            }
        });
    });

    socket.on('joinRoom', ({ roomId, playerName }) => {
        let targetRoomId = roomId;
        if (!targetRoomId || targetRoomId.trim() === "" || targetRoomId === "null") {
            const salaDisponivel = Object.values(rooms).find(r => r.gameState === 'lobby' && r.players.length < 4);
            if (salaDisponivel) targetRoomId = salaDisponivel.id;
            else targetRoomId = 'SALA' + Math.floor(1000 + Math.random() * 9000);
        }

        if (rooms[targetRoomId] && rooms[targetRoomId].players.length >= 4) {
            socket.emit('errorMsg', 'Esta sala já está cheia! Remova o código da URL para criar uma nova.');
            return;
        }

        if (!rooms[targetRoomId]) {
            rooms[targetRoomId] = {
                id: targetRoomId, players: [],
                votes: { '6-6': 0, '1-1': 0, votedCount: 0 },
                gameState: 'lobby', score: { duplaA: 0, duplaB: 0 },
                mesa: [], pontas: [-1, -1], turnoAtual: 0, ultimoVencedorId: null
            };
        }

        const room = rooms[targetRoomId];
        const playerIndex = room.players.length;
        const playerDupla = (playerIndex % 2 === 0) ? 'A' : 'B';
        
        room.players.push({
            id: socket.id, name: playerName || `Jogador ${playerIndex + 1}`,
            dupla: playerDupla, hand: []
        });

        socket.join(targetRoomId);
        socket.emit('initRoomId', { roomId: targetRoomId });

        io.to(targetRoomId).emit('roomUpdated', {
            players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
            count: room.players.length
        });

        if (room.players.length === 4 && room.gameState === 'lobby') {
            room.gameState = 'voting';
            io.to(targetRoomId).emit('startVoting');
        }
    });

    socket.on('castVote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'voting' || room.players.length < 4) return;

        room.votes[vote]++;
        room.votes.votedCount++;
        io.to(roomId).emit('voteProgress', { votedCount: room.votes.votedCount });

        if (room.votes.votedCount === 4) {
            let regraGanhadora = room.votes['1-1'] > room.votes['6-6'] ? '1-1' : '6-6';
            const baralho = criarBaralho();
            let jogadorInicialId = room.players[0].id; 
            let numeroProcurado = regraGanhadora === '6-6' ? 6 : 1;

            room.players.forEach((p, index) => {
                const maoSimulada = baralho.slice(index * 7, (index + 1) * 7);
                const temPedra = maoSimulada.some(pedra => pedra.ladoA === numeroProcurado && pedra.ladoB === numeroProcurado);
                if (temPedra) {
                    jogadorInicialId = p.id;
                    room.ultimoVencedorId = p.id;
                }
            });

            io.to(roomId).emit('votingFinished', { regra: regraGanhadora });
            iniciarRodadaOficial(room, baralho, jogadorInicialId);
        }
    });

    socket.on('jogarPedra', ({ roomId, pedra, ladoDaMesa }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'playing') return;

        const indexJogador = room.players.findIndex(p => p.id === socket.id);
        if (indexJogador !== room.turnoAtual) {
            socket.emit('errorMsg', 'Não é a sua vez de jogar!');
            return;
        }

        let jogadaValida = false;
        const { ladoA, ladoB } = pedra;

        // 🌟 PRIMEIRA PEDRA DA MESA (Abertura com 6-6 ou qualquer outra)
        if (room.mesa.length === 0) {
            room.mesa.push([ladoA, ladoB]);
            room.pontas = [ladoA, ladoB]; // Ex: 6 e 6
            jogadaValida = true;
        } else {
            // 👈 JOGANDO NA ESQUERDA da mesa
            if (ladoDaMesa === 'esquerda') {
                if (ladoB === room.pontas[0]) {
                    // Ex: Pedra é 3-6 e a ponta esquerda é 6. Fica na ordem [3, 6] para emendar o 6 com o 6 interno.
                    room.mesa.unshift([ladoA, ladoB]);
                    room.pontas[0] = ladoA; // Nova ponta vira 3
                    jogadaValida = true;
                } else if (ladoA === room.pontas[0]) {
                    // Ex: Pedra é 6-3 e a ponta esquerda é 6. Inverte para [3, 6] para a ponta externa virar 3.
                    room.mesa.unshift([ladoB, ladoA]);
                    room.pontas[0] = ladoB;
                    jogadaValida = true;
                }
            } 
            // 👉 JOGANDO NA DIREITA da mesa
            else if (ladoDaMesa === 'direita') {
                if (ladoA === room.pontas[1]) {
                    // Ex: Ponta direita é 6 e a pedra é 6-3. Fica [6, 3] para emendar o 6 interno.
                    room.mesa.push([ladoA, ladoB]);
                    room.pontas[1] = ladoB; // Nova ponta vira 3
                    jogadaValida = true;
                } else if (ladoB === room.pontas[1]) {
                    // Ex: Ponta direita é 6 e a pedra é 3-6. Inverte para [6, 3] para manter a continuidade.
                    room.mesa.push([ladoB, ladoA]);
                    room.pontas[1] = ladoA;
                    jogadaValida = true;
                }
            }
        }

        if (!jogadaValida) {
            socket.emit('errorMsg', 'Essa pedra não encaixa desse lado da mesa!');
            return;
        }

        const player = room.players[indexJogador];
        player.hand = player.hand.filter(p => !(p.ladoA === ladoA && p.ladoB === ladoB));

        if (player.hand.length === 0) {
            let vencedorDupla = player.dupla;
            if (vencedorDupla === 'A') room.score.duplaA += 1;
            if (vencedorDupla === 'B') room.score.duplaB += 1;
            room.ultimoVencedorId = socket.id;

            io.to(roomId).emit('roundEnded', { vencedor: vencedorDupla, score: room.score, motivo: `${player.name} Bateu!` });
            setTimeout(() => {
                const novoBaralho = criarBaralho();
                iniciarRodadaOficial(room, novoBaralho, room.ultimoVencedorId);
            }, 3000);
            return;
        }

        room.turnoAtual = (room.turnoAtual + 1) % 4;

        io.to(roomId).emit('atualizarMesa', {
            mesa: room.mesa,
            pontas: room.pontas,
            proximoTurno: room.players[room.turnoAtual].id,
            score: room.score
        });
    });

    socket.on('passarVez', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'playing') return;

        const indexJogador = room.players.findIndex(p => p.id === socket.id);
        if (indexJogador !== room.turnoAtual) return;

        room.turnoAtual = (room.turnoAtual + 1) % 4;

        io.to(roomId).emit('atualizarMesa', {
            mesa: room.mesa,
            pontas: room.pontas,
            proximoTurno: room.players[room.turnoAtual].id,
            score: room.score
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
