const socket = io();
let roomId = window.location.hash.substring(1) || 'SALA' + Math.floor(1000 + Math.random() * 9000);
window.location.hash = roomId;

function connectGame() {
    const name = document.getElementById('player-name').value.trim();
    if(!name) return alert("Digite um apelido!");
    
    document.querySelector('.input-group').classList.add('hidden');
    document.getElementById('lobby-info').classList.remove('hidden');
    document.getElementById('room-code').innerText = window.location.href;

    socket.emit('joinRoom', { roomId, playerName: name });
}

socket.on('roomUpdated', (data) => {
    document.getElementById('player-count').innerText = `Aguardando jogadores (${data.count}/4)...`;
});

// Abre Votação Automática (Regra 7)
socket.on('startVoting', () => {
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('vote-modal').classList.remove('hidden');
});

function enviarVoto(opcao) {
    socket.emit('castVote', { roomId, vote: opcao });
    document.getElementById('vote-modal').classList.add('hidden');
}

socket.on('voteProgress', (data) => {
    document.getElementById('vote-status').innerText = `Votos: ${data.votedCount}/4`;
});

socket.on('votingFinished', (data) => {
    alert(`Votação encerrada! Regra escolhida: Começa com quem tem o [ ${data.regra} ]`);
});

// Recebe as 7 pedras personalizadas do servidor
socket.on('receiveHand', (hand) => {
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = '';
    
    hand.forEach(piece => {
        const div = document.createElement('div');
        div.className = 'domino-piece';
        div.innerHTML = `<div>${piece.ladoA}</div><div class="line"></div><div>${piece.ladoB}</div>`;
        // Função de clique para simular a jogada na mesa
        div.onclick = () => {
            document.getElementById('board').innerHTML = div.outerHTML; 
            div.remove();
            if(handContainer.children.length === 0) {
                socket.emit('endRound', { roomId, trancado: false });
            }
        };
        handContainer.appendChild(div);
    });
});

// Trancamento manual para teste (Regra 5)
function solicitarTranque() {
    // Simula envio de pontos das mãos para calcular quem tem menos individualmente
    const mockupHands = [
        { id: socket.id, pontos: 12 },
        { id: "p2", pontos: 22 },
        { id: "p3", pontos: 5 }, // Esse jogador (Menor pontos individual) fará sua dupla ganhar
        { id: "p4", pontos: 30 }
    ];
    socket.emit('endRound', { roomId, playerHands: mockupHands, trancado: true });
}

socket.on('roundEnded', (data) => {
    alert(`${data.motivo} -> Dupla Ganhadora da rodada: ${data.vencedor}`);
    document.getElementById('score-a').innerText = data.score.duplaA;
    document.getElementById('score-b').innerText = data.score.duplaB;
});

function copyCode() {
    navigator.clipboard.writeText(window.location.href);
    alert('Link da sala copiado! Envie no WhatsApp dos seus amigos.');
}