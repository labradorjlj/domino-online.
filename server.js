const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) res.status(500).send("Erro ao carregar index.html");
    });
});

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

function obterNomesDuplas(room) {
    const duplaA = room.players.filter(p => p.dupla === 'A').map(p => p.name).join(' e ') || 'Dupla A';
    const duplaB = room.players.filter(p => p.dupla === 'B').map(p => p.name).join(' e ') || 'Dupla B';
    return { duplaA, duplaB };
}

// 🎲 INÍCIO OBRIGATÓRIO PELA SENA (6-6) OU PIO (1-1) CONFORME VOTAÇÃO
function iniciarRodadaOficial(room, baralhoGerado, regraEscolhida) {
    room.gameState = 'playing';
    room.mesa = [];
    room.pontas = [-1, -1];
    room.passadasSeguidas = 0;
    
    room.players.forEach((player, index) => {
        player.hand = baralhoGerado.slice(index * 7, (index + 1) * 7);
    });

    let indexQuemComeca = 0; // Padrão de segurança caso ocorra um imprevisto técnico

    if (regraEscolhida === '6-6') {
        const donoBucha = room.players.findIndex(p => p.hand.some(pedra => pedra.ladoA === 6 && pedra.ladoB === 6));
        if (donoBucha !== -1) {
            indexQuemComeca = donoBucha;
        }
    } else if (regraEscolhida === '1-1') {
        const donoPio = room.players.findIndex(p => p.hand.some(pedra => pedra.ladoA === 1 && pedra.ladoB === 1));
        if (donoPio !== -1) {
            indexQuemComeca = donoPio;
        }
    }

    room.turnoAtual = indexQuemComeca;

    room.players.forEach(player => {
        if (!player.isBot && io.sockets.sockets.get(player.id)) {
            io.to(player.id).emit('receiveHand', player.hand);
        }
    });

    const jogadorDaVez = room.players[room.turnoAtual];
    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: jogadorDaVez ? jogadorDaVez.id : null,
        nameTurnoAtual: jogadorDaVez ? jogadorDaVez.name : 'Aguardando...',
        score: room.score,
        nomesDuplas: obterNomesDuplas(room)
    });

    if (jogadorDaVez && jogadorDaVez.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

function processarDuplasPorVotacao(room) {
    let duplaFormada = false;
    const p = room.players;

    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            let votoI = room.escolhasParceiros[p[i].id];
            let votoJ = room.escolhasParceiros[p[j].id];

            if (votoI === p[j].id && votoJ === p[i].id) {
                p[i].dupla = 'A'; p[j].dupla = 'A';
                const outros = p.filter(pl => pl.id !== p[i].id && pl.id !== p[j].id);
                outros[0].dupla = 'B'; outros[1].dupla = 'B';
                duplaFormada = true;
                break;
            }
        }
        if (duplaFormada) break;
    }

    if (!duplaFormada) {
        p[0].dupla = 'A'; p[2].dupla = 'A';
        p[1].dupla = 'B'; p[3].dupla = 'B';
    }

    room.gameState = 'voting';
    io.to(room.id).emit('startVoting', { nomesDuplas: obterNomesDuplas(room) });
}

function verificarJogoTrancado(room) {
    if (room.passadasSeguidas >= 4) {
        let menorPontuacaoIndividual = Infinity;
        let jogadorComMenorPonto = null;

        room.players.forEach(p => {
            const pontos = p.hand.reduce((acc, pedra) => acc + pedra.ladoA + pedra.ladoB, 0);
            if (pontos < menorPontuacaoIndividual) {
                menorPontuacaoIndividual = pontos;
                jogadorComMenorPonto = p;
            }
        });

        let vencedorDupla = jogadorComMenorPonto.dupla;
        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        io.to(room.id).emit('roundEnded', {
            vencedor: vencedorDupla,
            score: room.score,
            motivo: `Mesa Trancou! Vitória da Dupla ${vencedorDupla}!`
        });

        setTimeout(() => {
            iniciarRodadaOficial(room, criarBaralho(), room.regraAtiva || '6-6');
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
        // Robô inicia com a primeira pedra da mão dele respeitando a regra
        executarJogadaServidor(room, bot, bot.hand[0], 'centro');
        return;
    }

    let jogou = false;
    for (let i = 0; i < bot.hand.length; i++) {
        const pedra = bot.hand[i];
        if (pedra.ladoA === room.pontas[0] || pedra.ladoB === room.pontas[0]) {
            executarJogadaServidor(room, bot, pedra, 'esquerda');
            jogou = true;
            break;
        } else if (pedra.ladoA === room.pontas[1] || pedra.ladoB === room.pontas[1]) {
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
            mesa: room.mesa, pontas: room.pontas, proximoTurno: proximo.id,
            nameTurnoAtual: proximo.name, score: room.score, nomesDuplas: obterNomesDuplas(room)
        });

        if (proximo.isBot) setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

function executarJogadaServidor(room, jogador, pedra, ladoDaMesa) {
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

        io.to(room.id).emit('roundEnded', { vencedor: vencedorDupla, score: room.score, motivo: `${jogador.name} Bateu!` });
        setTimeout(() => {
            iniciarRodadaOficial(room, criarBaralho(), room.regraAtiva || '6-6');
        }, 3000);
        return;
    }

    room.turnoAtual = (room.turnoAtual + 1) % 4;
    const proximo = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa, pontas: room.pontas, proximoTurno: proximo.id,
        nameTurnoAtual: proximo.name, score: room.score, nomesDuplas: obterNomesDuplas(room)
    });

    if (proximo.isBot) setTimeout(() => rodarInteligenciaBot(room), 1500);
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
        let targetRoomId = roomId;
        if (!targetRoomId || targetRoomId.trim() === "" || targetRoomId === "null") {
            const salaDisponivel = Object.values(rooms).find(r => r.gameState === 'lobby' && r.players.length < 4);
            targetRoomId = salaDisponivel ? salaDisponivel.id : 'SALA' + Math.floor(1000 + Math.random() * 9000);
        }

        if (!rooms[targetRoomId]) {
            rooms[targetRoomId] = {
                id: targetRoomId, players: [],
                votes: { '6-6': 0, '1-1': 0, votedCount: 0 },
                escolhasParceiros: {}, votosParceirosCount: 0, regraAtiva: '',
                gameState: 'lobby', score: { duplaA: 0, duplaB: 0 },
                mesa: [], pontas: [-1, -1], turnoAtual: 0, passadasSeguidas: 0
            };
        }

        const room = rooms[targetRoomId];
        if (room.players.length >= 4) return socket.emit('errorMsg', 'Sala cheia!');

        room.players.push({ id: socket.id, name: playerName, dupla: '', hand: [], isBot: false });
        socket.join(targetRoomId);
        socket.emit('initRoomId', { roomId: targetRoomId });

        io.to(targetRoomId).emit('roomUpdated', { count: room.players.length });

        if (room.players.length === 4 && room.gameState === 'lobby') {
            room.gameState = 'choosing_partner';
            room.players.forEach(p => {
                const outros = room.players.filter(o => o.id !== p.id).map(o => ({ id: o.id, name: o.name }));
                io.to(p.id).emit('abrirEscolhaParceiro', { outrosJogadores: outros });
            });
        }
    });

    socket.on('escolherParceiro', ({ roomId, escolheuId }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'choosing_partner') return;

        if (!room.escolhasParceiros[socket.id]) {
            room.escolhasParceiros[socket.id] = escolheuId;
            room.votosParceirosCount++;
            io.to(roomId).emit('atualizarStatusParceiros', { votosCount: room.votosParceirosCount });

            if (room.votosParceirosCount >= 4) processarDuplasPorVotacao(room);
        }
    });

    socket.on('adicionarRobos', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'lobby') return;

        while (room.players.length < 4) {
            const idx = room.players.length;
            room.players.push({
                id: 'BOT_' + Math.floor(Math.random() * 10000),
                name: nomesRobos[idx], dupla: '', hand: [], isBot: true
            });
        }
        room.players[0].dupla = 'A'; room.players[2].dupla = 'A';
        room.players[1].dupla = 'B'; room.players[3].dupla = 'B';

        room.regraAtiva = '6-6';
        iniciarRodadaOficial(room, criarBaralho(), '6-6');
    });

    socket.on('castVote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'voting') return;

        room.votes[vote]++;
        room.votes.votedCount++;

        if (room.votes.votedCount >= 4) {
            let regraGanhadora = room.votes['1-1'] > room.votes['6-6'] ? '1-1' : '6-6';
            room.regraAtiva = regraGanhadora;
            io.to(roomId).emit('votingFinished', { regra: regraGanhadora });
            iniciarRodadaOficial(room, criarBaralho(), regraGanhadora);
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
            mesa: room.mesa, pontas: room.pontas, proximoTurno: proximo.id,
            nameTurnoAtual: proximo.name, score: room.score, nomesDuplas: obterNomesDuplas(room)
        });

        if (proximo.isBot) setTimeout(() => rodarInteligenciaBot(room), 1500);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Ativo na porta ${PORT}`));
