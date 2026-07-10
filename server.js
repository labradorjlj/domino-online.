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

function iniciarPartidaDireto(room) {
    let regraGanhadora = Math.random() > 0.5 ? '6-6' : '1-1';
    const baralho = criarBaralho();
    
    room.players.forEach((player, index) => {
        player.hand = baralho.slice(index * 7, (index + 1) * 7);
    });

    let jogadorInicialId = room.players[0].id; 
    let numeroProcurado = regraGanhadora === '6-6' ? 6 : 1;

    for (let p of room.players) {
        const temBucha = p.hand.some(pedra => pedra.ladoA === numeroProcurado && pedra.ladoB === numeroProcurado);
        if (temBucha) {
            jogadorInicialId = p.id;
            room.ultimoVencedorId = p.id;
            break;
        }
    }

    room.gameState = 'playing';
    room.mesa = [];
    room.pontas = [-1, -1];
    room.passadasSeguidas = 0;
    room.turnoAtual = room.players.findIndex(p => p.id === jogadorInicialId);
    
    room.players.forEach((player) => {
        if (!player.isBot && io.sockets.sockets.get(player.id)) {
            io.to(player.id).emit('receiveHand', player.hand);
        }
    });

    const jogadorTurno = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: jogadorInicialId,
        nameTurnoAtual: jogadorTurno.name,
        score: room.score
    });

    if (jogadorTurno.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
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

    const jogadorTurno = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa,
        pontas: room.pontas,
        proximoTurno: grandfatherId,
        nameTurnoAtual: jogadorTurno.name,
        score: room.score
    });

    if (jogadorTurno.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1500);
    }
}

function verificarJogoTrancado(room) {
    if (room.passadasSeguidas >= 4) {
        let menorPontuacaoIndividual = Infinity;
        let jogadorComMenorPonto = null;

        room.players.forEach(p => {
            const pontosDoJogador = p.hand.reduce((acc, pedra) => acc + pedra.ladoA + pedra.ladoB, 0);
            
            if (pontosDoJogador < menorPontuacaoIndividual) {
                menorPontuacaoIndividual = pontosDoJogador;
                jogadorComMenorPonto = p;
            }
        });

        let vencedorDupla = jogadorComMenorPonto.dupla;

        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        room.ultimoVencedorId = jogadorComMenorPonto.id;

        io.to(room.id).emit('roundEnded', {
            vencedor: vencedorDupla,
            score: room.score,
            motivo: `Mesa Trancou! O jogador ${jogadorComMenorPonto.name} tinha a menor pontuação individual (${menorPontuacaoIndividual} pts). Vitória da Dupla ${vencedorDupla}!`
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
        const { ladoA, ladoB } = pedra;

        if (ladoA === room.pontas[0] || ladoB === room.pontas[0]) {
            executarJogadaServidor(room, bot, pedra, 'esquerda');
            jogou = true;
            break;
        }
        else if (ladoA === room.pontas[1] || ladoB === room.pontas
        
