const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); 
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Configuração do Envio de E-mail (Servidor SMTP / Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'seu_email@gmail.com',
        pass: process.env.EMAIL_PASS || 'sua_senha_de_app'
    }
});

const users = {};

function hashPassword(password, salt) {
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatórios!' });
    }
    const cleanEmail = email.toLowerCase().trim();
    const cleanUser = username.trim();

    if (users[cleanEmail] || Object.values(users).some(u => u.username.toLowerCase() === cleanUser.toLowerCase())) {
        return res.status(400).json({ error: 'Nome de usuário ou e-mail já cadastrado!' });
    }

    const { salt, hash } = hashPassword(password);
    const token = crypto.randomBytes(32).toString('hex');

    users[cleanEmail] = {
        username: cleanUser,
        email: cleanEmail,
        salt,
        hash,
        resetCode: null,
        token
    };

    return res.json({ 
        success: true, 
        message: 'Conta criada com sucesso!', 
        user: { username: cleanUser, email: cleanEmail }, 
        token 
    });
});

app.post('/api/login', (req, res) => {
    const { login, password } = req.body || {};
    if (!login || !password) {
        return res.status(400).json({ error: 'Informe o usuário/e-mail e a senha!' });
    }
    const cleanLogin = login.toLowerCase().trim();
    const user = users[cleanLogin] || Object.values(users).find(u => u.username.toLowerCase() === cleanLogin);

    if (!user) {
        return res.status(400).json({ error: 'Usuário ou senha incorretos!' });
    }

    const { hash } = hashPassword(password, user.salt);
    if (hash !== user.hash) {
        return res.status(400).json({ error: 'Usuário ou senha incorretos!' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.token = token;

    return res.json({ 
        success: true, 
        message: 'Login realizado com sucesso!', 
        user: { username: user.username, email: user.email }, 
        token 
    });
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Informe o e-mail cadastrado!' });
    
    const cleanEmail = email.toLowerCase().trim();
    const user = users[cleanEmail];

    if (!user) {
        return res.status(400).json({ error: 'E-mail não encontrado no sistema!' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = code;

    const mailOptions = {
        from: '"Dominó Cetens 🂓" <no-reply@dominocetens.com>',
        to: cleanEmail,
        subject: 'Código de Recuperação - Dominó Cetens',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #102e1b; color: #ffffff; border-radius: 10px;">
                <h2 style="color: #ffb703;">Dominó Cetens 🂓</h2>
                <p>Você solicitou a redefinição de senha para a sua conta.</p>
                <p>Seu código de verificação é:</p>
                <h1 style="background-color: #1a472a; color: #ffb703; padding: 10px; display: inline-block; border-radius: 5px; letter-spacing: 5px;">${code}</h1>
                <p>Insira este código no aplicativo para cadastrar sua nova senha.</p>
                <hr style="border-color: #2d6a4f;">
                <small style="color: #888;">Se não solicitou esta alteração, desconsidere este e-mail.</small>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return res.json({
            success: true,
            message: 'Código de verificação enviado para o seu e-mail!'
        });
    } catch (error) {
        console.error('Erro ao enviar e-mail:', error);
        return res.status(500).json({ 
            error: 'Erro ao enviar o e-mail. Verifique se o serviço de e-mail está configurado corretamente.' 
        });
    }
});

app.post('/api/reset-password', (req, res) => {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Preencha todos os campos!' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = users[cleanEmail];

    if (!user || user.resetCode !== code.trim()) {
        return res.status(400).json({ error: 'Código de verificação inválido!' });
    }

    const { salt, hash } = hashPassword(newPassword);
    user.salt = salt;
    user.hash = hash;
    user.resetCode = null;

    return res.json({ success: true, message: 'Senha redefinida com sucesso! Agora você pode fazer login.' });
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
    const duplaA = room.players.filter(p => p.dupla === 'A').map(p => p.name).join(' e ') || 'Casa';
    const duplaB = room.players.filter(p => p.dupla === 'B').map(p => p.name).join(' e ') || 'Visitante';
    return { duplaA, duplaB };
}

function reordenarJogadoresPorDuplaCruzada(room) {
    const duplaA = room.players.filter(pl => pl.dupla === 'A');
    const duplaB = room.players.filter(pl => pl.dupla === 'B');
    
    if (duplaA.length === 2 && duplaB.length === 2) {
        room.players = [duplaA[0], duplaB[0], duplaA[1], duplaB[1]];
    }
}

function resetarCronometro(room) {
    if (room.timerInterval) clearInterval(room.timerInterval);
    room.tempoRestante = 40;

    io.to(room.id).emit('timerUpdate', { tempo: room.tempoRestante });

    room.timerInterval = setInterval(() => {
        room.tempoRestante--;
        io.to(room.id).emit('timerUpdate', { tempo: room.tempoRestante });

        if (room.tempoRestante <= 0) {
            clearInterval(room.timerInterval);
            forcarJogadaAutomatica(room);
        }
    }, 1000);
}

function forcarJogadaAutomatica(room) {
    if (room.gameState !== 'playing') return;
    const jogador = room.players[room.turnoAtual];
    if (!jogador) return;

    if (room.mesa.length === 0) {
        let pedra = jogador.hand[0];
        if (room.regraAtiva === '6-6') {
            pedra = jogador.hand.find(p => p.ladoA === 6 && p.ladoB === 6) || jogador.hand[0];
        } else {
            pedra = jogador.hand.find(p => p.ladoA === 1 && p.ladoB === 1) || jogador.hand[0];
        }
        executarJogadaServidor(room, jogador, pedra, 'centro');
        return;
    }

    for (let i = 0; i < jogador.hand.length; i++) {
        const p = jogador.hand[i];
        if (p.ladoA === room.pontas[0] || p.ladoB === room.pontas[0]) {
            executarJogadaServidor(room, jogador, p, 'esquerda');
            return;
        } else if (p.ladoA === room.pontas[1] || p.ladoB === room.pontas[1]) {
            executarJogadaServidor(room, jogador, p, 'direita');
            return;
        }
    }

    room.passadasSeguidas++;
    if (verificarJogoTrancado(room)) return;

    room.turnoAtual = (room.turnoAtual + 1) % 4;
    const proximo = room.players[room.turnoAtual];

    io.to(room.id).emit('atualizarMesa', {
        mesa: room.mesa, pontas: room.pontas, proximoTurno: proximo.id,
        nameTurnoAtual: proximo.name, score: room.score, nomesDuplas: obterNomesDuplas(room),
        jogadores: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
        gameState: room.gameState
    });

    resetarCronometro(room);
    if (proximo.isBot) setTimeout(() => rodarInteligenciaBot(room), 1200);
}

function iniciarRodadaOficial(room, baralhoGerado, regraEscolhida) {
    if (room.timerVotacao) clearTimeout(room.timerVotacao);
    room.gameState = 'playing';
    room.regraAtiva = regraEscolhida || '6-6';
    room.mesa = []; 
    room.pontas = [-1, -1];
    room.passadasSeguidas = 0;
    
    room.players.forEach((player, index) => {
        player.hand = baralhoGerado.slice(index * 7, (index + 1) * 7);
    });

    let indexQuemComeca = 0; 

    if (room.regraAtiva === '6-6') {
        const donoBucha = room.players.findIndex(p => p.hand.some(pedra => pedra.ladoA === 6 && pedra.ladoB === 6));
        if (donoBucha !== -1) indexQuemComeca = donoBucha;
    } else if (room.regraAtiva === '1-1') {
        const donoPio = room.players.findIndex(p => p.hand.some(pedra => pedra.ladoA === 1 && pedra.ladoB === 1));
        if (donoPio !== -1) indexQuemComeca = donoPio;
    }

    room.turnoAtual = indexQuemComeca;

    room.players.forEach(player => {
        if (!player.isBot) {
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
        nomesDuplas: obterNomesDuplas(room),
        jogadores: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
        gameState: room.gameState
    });

    resetarCronometro(room);

    if (jogadorDaVez && jogadorDaVez.isBot) {
        setTimeout(() => rodarInteligenciaBot(room), 1200);
    }
}

function processarDuplasPorVotacao(room) {
    let duplaFormada = false;
    const p = room.players;

    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            let votoI = room.escolhasParceiros[p[i].id];
            let votoJ = room.escolhasParceiros[p[j].id];

            if (votoI && votoJ && votoI === p[j].id && votoJ === p[i].id) {
                p[i].dupla = 'A'; p[j].dupla = 'A';
                const outros = p.filter(pl => pl.id !== p[i].id && pl.id !== p[j].id);
                if (outros.length >= 2) {
                    outros[0].dupla = 'B'; outros[1].dupla = 'B';
                }
                duplaFormada = true;
                break;
            }
        }
        if (duplaFormada) break;
    }

    if (!duplaFormada && p.length >= 4) {
        p[0].dupla = 'A'; p[2].dupla = 'A';
        p[1].dupla = 'B'; p[3].dupla = 'B';
    }

    reordenarJogadoresPorDuplaCruzada(room);

    room.gameState = 'voting';
    io.to(room.id).emit('startVoting', { nomesDuplas: obterNomesDuplas(room) });

    if (room.timerVotacao) clearTimeout(room.timerVotacao);
    room.timerVotacao = setTimeout(() => {
        if (room.gameState === 'voting') {
            room.regraAtiva = '6-6';
            iniciarRodadaOficial(room, criarBaralho(), '6-6');
        }
    }, 10000);
}

function verificarJogoTrancado(room) {
    if (room.passadasSeguidas >= 4) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        let menorPontuacaoIndividual = Infinity;
        let jogadorComMenorPonto = null;

        room.players.forEach(p => {
            const pontos = p.hand.reduce((acc, pedra) => acc + pedra.ladoA + pedra.ladoB, 0);
            if (pontos < menorPontuacaoIndividual) {
                menorPontuacaoIndividual = pontos;
                jogadorComMenorPonto = p;
            }
        });

        let vencedorDupla = jogadorComMenorPonto ? jogadorComMenorPonto.dupla : 'A';
        if (vencedorDupla === 'A') room.score.duplaA += 1;
        if (vencedorDupla === 'B') room.score.duplaB += 1;

        let vencedorNome = vencedorDupla === 'A' ? 'Casa' : 'Visitante';

        io.to(room.id).emit('roundEnded', {
            vencedor: vencedorDupla,
            score: room.score,
            motivo: `Mesa Trancou! Vitória do time ${vencedorNome}!`
        });

        setTimeout(() => {
            iniciarRodadaOficial(room, criarBaralho(), room.regraAtiva || '6-6');
        }, 3500);

        return true;
    }
    return false;
}

function rodarInteligenciaBot(room) {
    if (room.gameState !== 'playing') return;
    const bot = room.players[room.turnoAtual];
    if (!bot || !bot.isBot) return;

    if (room.mesa.length === 0) {
        let pedraDeSaida = bot.hand[0]; 
        if (room.regraAtiva === '6-6') {
            const sena = bot.hand.find(p => p.ladoA === 6 && p.ladoB === 6);
            if (sena) pedraDeSaida = sena;
        } else if (room.regraAtiva === '1-1') {
            const pio = bot.hand.find(p => p.ladoA === 1 && p.ladoB === 1);
            if (pio) pedraDeSaida = pio;
        }
        executarJogadaServidor(room, bot, pedraDeSaida, 'centro');
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
            nameTurnoAtual: proximo.name, score: room.score, nomesDuplas: obterNomesDuplas(room),
            jogadores: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
            gameState: room.gameState
        });

        resetarCronometro(room);
        if (proximo.isBot) setTimeout(() => rodarInteligenciaBot(room), 1200);
    }
}

function executarJogadaServidor(room, jogador, pedra, ladoDaMesa) {
    const { ladoA, ladoB } = pedra;
    room.passadasSeguidas = 0; 

    if (room.mesa.length === 0) {
        room.mesa.push({ pedra: [ladoA, ladoB], lado: 'centro' });
        room.pontas = [ladoA, ladoB];
    } else {
        if (ladoDaMesa === 'esquerda') {
            if (ladoB === room.pontas[0]) {
                room.pontas[0] = ladoA;
            } else {
                room.pontas[0] = ladoB;
            }
            room.mesa.push({ pedra: [ladoA, ladoB], lado: 'esquerda' });
        } else if (ladoDaMesa === 'direita') {
            if (ladoA === room.pontas[1]) {
                room.pontas[1] = ladoB;
            } else {
                room.pontas[1] = ladoA;
            }
            room.mesa.push({ pedra: [ladoA, ladoB], lado: 'direita' });
        }
    }

    jogador.hand = jogador.hand.filter(p => !(p.ladoA === ladoA && p.ladoB === ladoB));

    room.players.forEach(p => {
        if (!p.isBot) io.to(p.id).emit('receiveHand', p.hand);
    });

    if (jogador.hand.length === 0) {
        if (room.timerInterval) clearInterval(room.timerInterval);
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
        nameTurnoAtual: proximo.name, score: room.score, nomesDuplas: obterNomesDuplas(room),
        jogadores: room.players.map(p => ({ name: p.name, dupla: p.dupla })),
        gameState: room.gameState
    });

    resetarCronometro(room);
    if (proximo.isBot) setTimeout(() => rodarInteligenciaBot(room), 1200);
}

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName, modoSolo }) => {
        let targetRoomId = roomId;

        if (modoSolo) {
            targetRoomId = 'SOLO_' + Math.floor(1000 + Math.random() * 9000);
        } else if (!targetRoomId || targetRoomId.trim() === "" || targetRoomId === "null") {
            const salaDisponivel = Object.values(rooms).find(r => r.gameState === 'lobby' && r.players.length < 4);
            targetRoomId = salaDisponivel ? salaDisponivel.id : 'SALA_' + Math.floor(1000 + Math.random() * 9000);
        }

        if (!rooms[targetRoomId]) {
            rooms[targetRoomId] = {
                id: targetRoomId, players: [],
                votes: { '6-6': 0, '1-1': 0, votedCount: 0 },
                escolhasParceiros: {}, votosParceirosCount: 0, regraAtiva: '6-6',
                gameState: 'lobby', score: { duplaA: 0, duplaB: 0 },
                mesa: [], pontas: [-1, -1], turnoAtual: 0, passadasSeguidas: 0,
                tempoRestante: 40, timerInterval: null, timerVotacao: null
            };
        }

        const room = rooms[targetRoomId];
        if (room.players.length >= 4) return socket.emit('errorMsg', 'Sala cheia!');

        socket.roomId = targetRoomId;
        room.players.push({ id: socket.id, name: playerName || 'Jogador', dupla: '', hand: [], isBot: false });
        socket.join(targetRoomId);
        socket.emit('initRoomId', { roomId: targetRoomId });

        io.to(targetRoomId).emit('roomUpdated', { 
            count: room.players.length, 
            roomId: targetRoomId, 
            players: room.players.map(p => p.name),
            gameState: room.gameState
        });

        if (modoSolo) {
            while (room.players.length < 4) {
                const idx = room.players.length;
                room.players.push({
                    id: 'BOT_' + Math.floor(Math.random() * 10000),
                    name: nomesRobos[idx], dupla: '', hand: [], isBot: true
                });
            }
            room.players[0].dupla = 'A'; room.players[2].dupla = 'A';
            room.players[1].dupla = 'B'; room.players[3].dupla = 'B';

            reordenarJogadoresPorDuplaCruzada(room);

            room.gameState = 'voting';
            setTimeout(() => {
                io.to(room.id).emit('startVoting', { nomesDuplas: obterNomesDuplas(room) });
            }, 100);

            if (room.timerVotacao) clearTimeout(room.timerVotacao);
            room.timerVotacao = setTimeout(() => {
                if (room.gameState === 'voting') {
                    iniciarRodadaOficial(room, criarBaralho(), '6-6');
                }
            }, 8000);
            return;
        }

        if (room.players.length === 4 && room.gameState === 'lobby') {
            room.gameState = 'choosing_partner';
            room.players.forEach(p => {
                const outros = room.players.filter(o => o.id !== p.id).map(o => ({ id: o.id, name: o.name }));
                io.to(p.id).emit('abrirEscolhaParceiro', { outrosJogadores: outros });
            });

            if (room.timerVotacao) clearTimeout(room.timerVotacao);
            room.timerVotacao = setTime
