const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

const rooms = {};
const nomesRobos = ["Bob Robô 🤖", "Ted Robô 🤖", "Max Robô 🤖", "Bia Robô 🤖"];

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
    room.passadasSeguidas = 0;
    
    room.turnoAtual = room.players.findIndex(p => p.id === jogadorInicialId);
    
    room.players.forEach((player, index) => {
        player.hand = baralhoGerado.slice(index * 7, (index + 1) * 7);
        if (!player.isBot && io.sockets.sockets.get(player.id)) {
            io.to(player.id).emit('receiveHand', player.hand);
        }
    });

    const jogadorTurno = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: jogadorInicialId,
        nomeTurnoAtual: jogadorTurno.name,
        score: room.score
    });

    if (jogadorTurno.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

function verificarJogoTrancado(room) {
    if (room.passadasSeguidas >= 4) {
        let pontosDuplaA = 0;
        let pontosDuplaB = 0;

        room.players.forEach(p => {
            const pontosJogador = p.hand.reduce((acc, pedra) => acc + pedra.ladoA + pedra.ladoB, 0);
            if (p.dupla === 'A') pontosDuplaA += pontosJogador;
            if (p.dupla === 'B') pontosDuplaB += pontosJogador;
        });

        let vencedorDupla = pontosDuplaA < pontosDuplaB ? 'A' : 'B';

        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        let menorPontosIndiv = Infinity;
        let proximoIniciadorId = room.players[0].id;

        room.players.forEach(p => {
            const pts = p.hand.reduce((acc, pedra) => acc + pedra.ladoA + pedra.ladoB, 0);
            if (pts < menorPontosIndiv) {
                menorPontosIndiv = pts;
                proximoIniciadorId = p.id;
            }
        });

        room.ultimoVencedorId = proximoIniciadorId;

        io.to(room.id).emit('roundEnded', {
            vencedor: vencedorDupla,
            score: room.score,
            motivo: `Mesa Trancou! Dupla A: ${pontosDuplaA} pts vs Dupla B: ${pontosDuplaB} pts.`
        });

        setTimeout(() => {
            const novoBaralho = criarBaralho();
            iniciarRodadaOficial(room, novoBaralho, room.ultimoVencedorId);
        }, 4000);

        return true;
    }
    return false;
}

function rodarInteligenciaBot(room) {
    if (room.gameState !== 'playing') return;
    
    const bot = room.players[room.turnoAtual];
    if (!bot || !bot.isBot) return;

    if (room.mesa.length === 0) {
        const pedraEscolhida = bot.hand[0];
        executarJogadaServidor(room, bot, pedraEscolhida, 'centro');
        return;
    }

    let jogou = false;
    
    // 🧠 INTELIGÊNCIA CORRIGIDA DA BIA E OUTROS ROBÔS
    for (let i = 0; i < bot.hand.length; i++) {
        const pedra = bot.hand[i];
        const { ladoA, ladoB } = pedra;

        if (ladoA === room.pontas[0] || ladoB === room.pontas[0]) {
            executarJogadaServidor(room, bot, pedra, 'esquerda');
            jogou = true;
            break;
        }
        else if (ladoA === room.pontas[1] || ladoB === room.pontas[1]) {
            executarJogadaServidor(room, bot, pedra, 'direita');
            jogou = true;
            break;
        }
    }

    if (!jogou) {
        room.passadasSeguidas++;
        
        if (verificarJogoTrancado(room)) return;

        room.turnoAtual = (room.turnoAtual + 1) % 4;
        const proximo = room.players[room.turnoAtual];
        
        io.to(room.id).emit('atualizarMesa', {
            mesa: room.mesa, pontas: room.pontas,
            proximoTurno: proximo.id, nomeTurnoAtual: proximo.name, score: room.score
        });

        if (proximo.isBot) {
            setTimeout(() => rodarInteligenciaBot(room), 1500);
        }
    }
}

function ejecutarJogadaServidor(room, jogador, pedra, ladoDaMesa) {
    const { ladoA, ladoB } = pedra;
    room.passadasSeguidas = 0; 

    if (room.mesa.length === 0) {
        room.mesa.push([ladoA, ladoB]);
        room.pontas = [ladoA, ladoB];
    } else {
        if (ladoDaMesa === 'esquerda') {
            if (ladoB === room.pontas[0]) {
                room.mesa.unshift([ladoA, ladoB]);
                room.pontas[0] = ladoA;
            } else {
                room.mesa.unshift([ladoB, ladoA]);
                room.pontas[0] = ladoB;
            }
        } else if (ladoDaMesa === 'direita') {
            if (ladoA === room.pontas[1]) {
                room.mesa.push([ladoA, ladoB]);
                room.pontas[1] = ladoB;
            } else {
                room.mesa.push([ladoB, ladoA]);
                room.pontas[1] = ladoA;
            }
        }
    }

    jogador.hand = jogador.hand.filter(p => !(p.ladoA === ladoA && p.ladoB === ladoB));

    if (jogador.hand.length === 0) {
        let vencedorDupla = jogador.dupla;
        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;
        room.ultimoVencedorId = jogador.id;

        io.to(room.id).emit('roundEnded', { vencedor: vencedorDupla, score: room.score, motivo: `${jogador.name} Bateu!` });
        setTimeout(() => {
            const novoBaralho = criarBaralho();
            iniciarRodadaOficial(room, novoBaralho, room.ultimoVencedorId);
        }, 3000);
        return;
    }

    room.turnoAtual = (room.turnoAtual + 1) % 4;
    const proximo = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: proximo.id,
        nomeTurnoAtual: proximo.name,
        score: room.score
    });

    if (proximo.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

io.on('connection', (socket) => {
    socket.on('disconnect', () => {
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            const eraHumanoDaSala = room.players.some(p => p.id === socket.id && !p.isBot);
            if (!eraHumanoDaSala) return;

            room.players = room.players.filter(p => p.id !== socket.id);
            
            if (room.players.filter(p => !p.isBot).length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('roomUpdated', {
                    players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
                    count: room.players.length
                });
                if (room.gameState !== 'lobby') {
                    room.gameState = 'lobby';
                    room.votes = { '6-6': 0, '1-1': 0, votedCount: 0 };
                    io.to(roomId).emit('errorMsg', 'Um jogador real caiu da sala. Voltando ao lobby.');
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
            socket.emit('errorMsg', 'Esta sala já está cheia!');
            return;
        }

        if (!rooms[targetRoomId]) {
            rooms[targetRoomId] = {
                id: targetRoomId, players: [],
                votes: { '6-6': 0, '1-1': 0, votedCount: 0 },
                gameState: 'lobby', score: { duplaA: 0, duplaB: 0 },
                mesa: [], pontas: [-1, -1], turnoAtual: 0, ultimoVencedorId: null,
                passadasSeguidas: 0
            };
        }

        const room = rooms[targetRoomId];
        const playerIndex = room.players.length;
        const playerDupla = (playerIndex % 2 === 0) ? 'A' : 'B';
        
        room.players.push({
            id: socket.id, name: playerName || `Jogador ${playerIndex + 1}`,
            dupla: playerDupla, hand: [], isBot: false
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

    socket.on('adicionarRobos', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'lobby') return;

        while (room.players.length < 4) {
            const idx = room.players.length;
            const duplaBot = (idx % 2 === 0) ? 'A' : 'B';
            const nomeBot = nomesRobos[idx] || `Robô ${idx} 🤖`;
            
            room.players.push({
                id: 'BOT_' + Math.floor(Math.random() * 100000) + '_' + idx,
                name: nomeBot,
                dupla: duplaBot,
                hand: [],
                isBot: true
            });

            const votoBot = Math.random() > 0.5 ? '6-6' : '1-1';
            room.votes[votoBot]++;
            room.votes.votedCount++;
        }

        io.to(roomId).emit('roomUpdated', {
            players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
            count: room.players.length
        });

        if (room.players.length === 4) {
            room.gameState = 'voting';
            io.to(roomId).emit('startVoting');
        }
    });

    socket.on('castVote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'voting' || room.players.length < 4) return;

        room.votes[vote]++;
        room.votes.votedCount++;
        io.to(roomId).emit('voteProgress', { votedCount: room.votes.votedCount });

        if (room.votes.votedCount >= 4) {
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
        if (indexJogador !== room.turnoAtual) return;

        executarJogadaServidor(room, room.players[indexJogador], pedra, ladoDaMesa);
    });

    socket.on('passarVez', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'playing') return;

        const indexJogador = room.players.findIndex(p => p.id === socket.id);
        if (indexJogador !== room.turnoAtual) return;

        room.passadasSeguidas++;

        if (verificarJogoTrancado(room)) return;

        room.turnoAtual = (room.turnoAtual + 1) % 4;
        const proximo = room.players[room.turnoAtual];

        io.to(roomId).emit('atualizarMesa', {
            mesa: room.mesa,
            pontas: room.pontas,
            proximoTurno: proximo.id,
            nomeTurnoAtual: proximo.name,
            score: room.score
        });

        if (proximo.isBot) {
            setTimeout(() => rodarInteligenciaBot(room), 1500);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando com sucesso na porta ${PORT}`));
