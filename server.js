const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const rooms = {};

// Função para criar e embaralhar as 28 pedras
function criarBaralho() {
    const pedras = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            pedras.push({ ladoA: i, ladoB: j });
        }
    }
    return pedras.sort(() => Math.random() - 0.5);
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                votes: { '6-6': 0, '1-1': 0, votedCount: 0 },
                gameState: 'lobby',
                score: { duplaA: 0, duplaB: 0 }
            };
        }

        const room = rooms[roomId];
        if (room.players.length >= 4) {
            socket.emit('errorMsg', 'Esta sala já está cheia!');
            return;
        }

        const playerIndex = room.players.length;
        const playerDupla = (playerIndex % 2 === 0) ? 'A' : 'B';
        
        room.players.push({
            id: socket.id,
            name: playerName || `Jogador ${playerIndex + 1}`,
            dupla: playerDupla,
            hand: []
        });

        socket.join(roomId);
        
        io.to(roomId).emit('roomUpdated', {
            players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
            count: room.players.length
        });

        // Regra 7: Início automático com 4 pessoas -> Abre votação
        if (room.players.length === 4 && room.gameState === 'lobby') {
            room.gameState = 'voting';
            io.to(roomId).emit('startVoting');
        }
    });

    socket.on('castVote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'voting') return;

        room.votes[vote]++;
        room.votes.votedCount++;

        io.to(roomId).emit('voteProgress', { votedCount: room.votes.votedCount });

        if (room.votes.votedCount === 4) {
            // Regra 4: Se empatar, 6-6 começa obrigatoriamente
            let regraGanhadora = room.votes['1-1'] > room.votes['6-6'] ? '1-1' : '6-6';
            room.gameState = 'playing';

            // Distribui 7 pedras para cada um
            const baralho = criarBaralho();
            room.players.forEach((player, index) => {
                player.hand = baralho.slice(index * 7, (index + 1) * 7);
                io.to(player.id).emit('receiveHand', player.hand);
            });

            io.to(roomId).emit('votingFinished', { regra: regraGanhadora });
        }
    });

    socket.on('endRound', ({ roomId, playerHands, trancado }) => {
        const room = rooms[roomId];
        if (!room) return;

        let vencedorDupla = null;

        if (trancado) {
            // Regra 5: Menos pontos individual ganha no trancamento
            let menorPontuacao = Infinity;
            playerHands.forEach(p => {
                if (p.pontos < menorPontuacao) {
                    menorPontuacao = p.pontos;
                    const pData = room.players.find(pl => pl.id === p.id);
                    if (pData) vencedorDupla = pData.dupla;
                }
            });
        } else {
            const quemBateu = room.players.find(p => p.id === socket.id);
            if (quemBateu) vencedorDupla = quemBateu.dupla;
        }

        // Regra 3: Dupla que ganhar leva exatamente 1 ponto
        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        io.to(roomId).emit('roundEnded', {
            vencedor: vencedorDupla,
            score: room.score,
            motivo: trancado ? 'Jogo Trancado! (Menor pontos individual ganhou)' : 'Bateu!'
        });
        
        // Reseta para a próxima rodada
        room.gameState = 'lobby';
        room.votes = { '6-6': 0, '1-1': 0, votedCount: 0 };
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));