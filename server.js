const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Configura o servidor para ler os arquivos estáticos diretamente da raiz do projeto
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.sendFile(path.join(__dirname, 'index.html'));
});

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

function iniciarRodadaOficial(room, baralhoGerado, grandfatherId) {
    room.gameState = 'playing';
    room.mesa = [];
    room.pontas = [-1, -1];
    room.passadasSeguidas = 0;
    room.turnoAtual = room.players.findIndex(p => p.id === grandfatherId);
    
    room.players.forEach((player, index) => {
        player.hand = baralhoGerado.slice(index * 7, (index + 1) * 7);
        if (!player.isBot && io.sockets.sockets.get(player.id)) {
            io.to(player.id).emit('receiveHand', player.hand);
        }
    });

    const grandfatherPlayer = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: grandfatherId,
        nameTurnoAtual: grandfatherPlayer ? grandfatherPlayer.name : 'Aguardando...',
        score: room.score,
        nomesDuplas: obterNomesDuplas(room)
    });

    if (grandfatherPlayer && grandfatherPlayer.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

function processarDuplasPorVotacao(room) {
    let duplaFormada = false;
    const p = room.players;

    for(let i=0; i<4; i++) {
        for(let j=i+1; j<4; j++) {
            if(room.escolhasParceiros[p[i].id] === p[j].id && room.escolhasParceiros[p[j].id] === p[i].id) {
                p[i].dupla = 'A';
                p[j].dupla = 'A';
                
                const outros = p.filter(pl => pl.id !== p[i].id && pl.id !== p[j].id);
                outros[0].dupla = 'B';
                outros[1].dupla = 'B';
                
                duplaFormada = true;
                break;
            }
        }
        if(duplaFormada) break;
    }

    if(!duplaFormada) {
        p[0].dupla = 'A'; p[1].dupla = 'B';
        p[2].dupla = 'A'; p[3].dupla = 'B';
    }

    room.gameState = 'voting';
    io.to(room.id).emit('startVoting');
}

function verificarJogoTrancado(room) {
    if (room.passadasSeguidas >= 4) {
        let menorPontuacaoIndividual = Infinity;
        let grandfatherComMenorPonto = null;

        room.players.forEach(p => {
            const pontosDoJogador = p.hand.reduce((acc, pedra) => acc + pedra.ladoA + pedra.ladoB, 0);
            if (pontosDoJogador < menorPontuacaoIndividual) {
                menorPontuacaoIndividual = pontosDoJogador;
                grandfatherComMenorPonto = p;
            }
        });

        let vencedorDupla = grandfatherComMenorPonto.dupla;
        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        room.ultimoVencedorId = grandfatherComMenorPonto.id;

        io.to(room.id).emit('roundEnded', {
            vencedor: vencedorDupla,
            score: room.score,
            motivo: `Mesa Trancou! Vitória da Dupla ${vencedorDupla}!`
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
            mesa: room.mesa, pontas: room.pontas,
            proximoTurno: proximo.id, nameTurnoAtual: proximo.name, score: room.score,
            nomesDuplas: obterNomesDuplas(room)
        });

        if (proximo.isBot) {
            setTimeout(() => rodarInteligenciaBot(room), 1500);
        }
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
        nameTurnoAtual: proximo.name,
        score: room.score,
        nomesDuplas: obterNomesDuplas(room)
    });

    if (proximo.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
        let targetRoomId = roomId;
        if (!targetRoomId || targetRoomId.trim() === "" || targetRoomId === "null") {
            const salaDisponivel = Object.values(rooms).find(r => r.gameState === 'lobby' && r.players.length < 4);
            if (salaDisponivel) targetRoomId = salaDisponivel.id;
            else targetRoomId = 'SALA' + Math.floor(1000 + Math.random() * 9000);
        }

        if (!rooms[targetRoomId]) {
            rooms[targetRoomId] = {
                id: targetRoomId, players: [],
                votes: { '6-6': 0, '1-1': 0, votedCount: 0 },
                escolhasParceiros: {}, votosParceirosCount: 0,
                gameState: 'lobby', score: { duplaA: 0, duplaB: 0 },
                mesa: [], pontas: [-1, -1], turnoAtual: 0, ultimoVencedorId: null,
                passadasSeguidas: 0
            };
        }

        const room = rooms[targetRoomId];
        if (room.players.length >= 4) return socket.emit('errorMsg', 'Sala cheia!');

        const playerDupla = (room.players.length % 2 === 0) ? 'A' : 'B';
        room.players.push({ id: socket.id, name: playerName, dupla: playerDupla, hand: [], isBot: false });

        socket.join(targetRoomId);
        socket.emit('initRoomId', { roomId: targetRoomId });

        io.to(targetRoomId).emit('roomUpdated', {
            players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
            count: room.players.length
        });

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

            if (room.votosParceirosCount >= 4) {
                processarDuplasPorVotacao(room);
            }
        }
    });

    socket.on('adicionarRobos', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'lobby') return;

        while (room.players.length < 4) {
            const idx = room.players.length;
            const duplaBot = (idx % 2 === 0) ? 'A' : 'B';
            room.players.push({
                id: 'BOT_' + Math.floor(Math.random() * 10000),
                name: nomesRobos[idx] || `Robô ${idx} 🤖`,
                dupla: duplaBot, hand: [], isBot: true
            });
        }

        io.to(roomId).emit('roomUpdated', {
            players: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
            count: room.players.length
        });

        const baralho = criarBaralho();
        iniciarRodadaOficial(room, baralho, room.players[0].id);
    });

    socket.on('castVote', ({ roomId, vote }) => {
        const room = rooms[roomId];
        if (!room || room.gameState !== 'voting') return;

        room.votes[vote]++;
        room.votes.votedCount++;
        io.to(roomId).emit('voteProgress', { votedCount: room.votes.votedCount });

        if (room.votes.votedCount >= 4) {
            let regraGanhadora = room.votes['1-1'] > room.votes['6-6'] ? '1-1' : '6-6';
            const baralho = criarBaralho();
            io.to(roomId).emit('votingFinished', { regra: regraGanhadora });
            iniciarRodadaOficial(room, baralho, room.players[0].id);
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
            mesa: room.mesa, pontas: room.pontas,
            proximoTurno: proximo.id, nameTurnoAtual: proximo.name, score: room.score,
            nomesDuplas: obterNomesDuplas(room)
        });

        if (proximo.isBot) {
            setTimeout(() => rodarInteligenciaBot(room), 1500);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando com sucesso na porta ${PORT}`));
