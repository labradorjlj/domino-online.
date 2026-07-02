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

function iniciarNovaRodada(room, playerInicialId) {
    room.gameState = 'playing';
    room.mesa = [];
    room.pontas = [-1, -1];
    
    const baralho = criarBaralho();
    room.players.forEach((player, index) => {
        player.hand = baralho.slice(index * 7, (index + 1) * 7);
        io.to(player.id).emit('receiveHand', player.hand);
    });

    room.turnoAtual = room.players.findIndex(p => p.id === playerInicialId);

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: playerInicialId,
        score: room.score
    });
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
        let targetRoomId = roomId;

        // CORREÇÃO: Se não houver roomId ou for inválido, cria uma sala padrão ou usa uma existente sem dono
        if (!targetRoomId || targetRoomId.trim() === "" || targetRoomId === "null") {
            // Procura por uma sala de lobby aberta que ainda não esteja cheia
            const salaDisponivel = Object.values(rooms).find(r => r.gameState === 'lobby' && r.players.length < 4);
            if (salaDisponivel) {
                targetRoomId = salaDisponivel.id;
            } else {
                // Se não houver salas abertas, gera um ID único definitivo no servidor
                targetRoomId = 'SALA' + Math.floor(1000 + Math.random() * 9000);
            }
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
        if (room.players.length >= 4) {
            socket.emit('errorMsg', 'Esta sala já está cheia!');
            return;
        }

        const playerIndex = room.players.length;
        const playerDupla = (playerIndex % 2 === 0) ? 'A' : 'B';
        
        room.players.push({
            id: socket.id, name: playerName || `Jogador ${playerIndex + 1}`,
            dupla: playerDupla, hand: []
        });

        socket.join(targetRoomId);
        
        // Avisa o cliente qual é o roomId real e oficial que o servidor definiu/encontrou
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
        if (!room || room.gameState !== 'voting') return;
        if (room.players.length < 4) return;

        room.votes[vote]++;
        room.votes.votedCount++;

        io.to(roomId).emit('voteProgress', { votedCount: room.votes.votedCount });

        if (room.votes.votedCount === 4) {
            let regraGanhadora = room.votes['1-1'] > room.votes['6-6'] ? '1-1' : '6-6';
            
            room.mesa = [];
            room.pontas = [-1, -1];
            
            const baralho = criarBaralho();
            room.players.forEach((player, index) => {
                player.hand = baralho.slice(index * 7, (index + 1) * 7);
                io.to(player.id).emit('receiveHand', player.hand);
            });

            let jogadorInicialId = room.players[0].id; 
            let numeroProcurado = regraGanhadora === '6-6' ? 6 : 1;

            room.players.forEach(p => {
                const temPedra = p.hand.some(pedra => pedra.ladoA === numeroProcurado && pedra.ladoB === numeroProcurado);
                if (temPedra) {
                    jogadorInicialId = p.id;
                    room.ultimoVencedorId = p.id;
                }
            });

            io.to(roomId).emit('votingFinished', { regra: regraGanhadora });
            iniciarNovaRodada(room, jogadorInicialId);
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

        if (room.mesa.length === 0) {
            room.mesa.push([ladoA, ladoB]);
            room.pontas = [ladoA, ladoB];
            jogadaValida = true;
        } else {
            if (ladoDaMesa === 'esquerda' && (ladoB === room.pontas[0] || ladoA === room.pontas[0])) {
                if (ladoB === room.pontas[0]) {
                    room.mesa.unshift([ladoA, ladoB]);
                    room.pontas[0] = ladoA;
                } else {
                    room.mesa.unshift([ladoB, ladoA]);
                    room.pontas[0] = ladoB;
                }
                jogadaValida = true;
            } 
            else if (ladoDaMesa === 'direita' && (ladoA === room.pontas[1] || ladoB === room.pontas[1])) {
                if (ladoA === room.pontas[1]) {
                    room.mesa.push([ladoA, ladoB]);
                    room.pontas[1] = ladoB;
                } else {
                    room.mesa.push([ladoB, ladoA]);
                    room.pontas[1] = ladoA;
                }
                jogadaValida = true;
            }
        }

        if (!jogadaValida) {
            socket.emit('errorMsg', 'Essa jogada é inválida para este lado!');
            return;
        }

        const jogador = room.players[indexJogador];
        jogador.hand = Math.floor ? jogador.hand.filter(p => !(p.ladoA === ladoA && p.ladoB === ladoB)) : jogador.hand.filter(p => !(p.ladoA === ladoA && p.ladoB === ladoB));

        if (jogador.hand.length === 0) {
            let vencedorDupla = jogador.dupla;
            if (vencedorDupla === 'A') room.score.duplaA += 1;
            if (vencedorDupla === 'B') room.score.duplaB += 1;

            room.ultimoVencedorId = socket.id;

            io.to(roomId).emit('roundEnded', {
                vencedor: vencedorDupla, score: room.score, motivo: `${jogador.name} Bateu!`
            });

            setTimeout(() => {
                iniciarNovaRodada(room, room.ultimoVencedorId);
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

    socket.on('endRound', ({ roomId, playerHands, trancado }) => {
        const room = rooms[roomId];
        if (!room) return;

        let vencedorDupla = null;
        let jogadorVencedorId = room.players[0].id;

        if (trancado) {
            let menorPontuacao = Infinity;
            playerHands.forEach(p => {
                if (p.pontos < menorPontuacao) {
                    menorPontuacao = p.pontos;
                    jogadorVencedorId = p.id;
                    const pData = room.players.find(pl => pl.id === p.id);
                    if (pData) vencedorDupla = pData.dupla;
                }
            });
        }

        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        room.ultimoVencedorId = jogadorVencedorId;

        io.to(roomId).emit('roundEnded', {
            vencedor: vencedorDupla, score: room.score,
            motivo: 'Jogo Trancado!'
        });
        
        setTimeout(() => {
            iniciarNovaRodada(room, room.ultimoVencedorId);
        }, 3000);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
