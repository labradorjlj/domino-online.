
const socket = io();
let roomId = window.location.hash.substring(1) || 'SALA' + Math.floor(1000 + Math.random() * 9000);
window.location.hash = roomId;

let meuId = "";
let turnoDeQuem = "";

function connectGame() {
    const name = document.getElementById('player-name').value.trim();
    if(!name) return alert("Digite um apelido!");
    
    document.querySelector('.input-group').classList.add('hidden');
    document.getElementById('lobby-info').classList.remove('hidden');
    document.getElementById('room-code').innerText = window.location.href;

    // Guarda o ID temporário do jogador para saber quando é a vez dele
    meuId = socket.id; 

    socket.emit('joinRoom', { roomId, playerName: name });
}

socket.on('roomUpdated', (data) => {
    document.getElementById('player-count').innerText = `Aguardando jogadores (${data.count}/4)...`;
});

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
    document.getElementById('vote-modal').classList.add('hidden');
});

// Recebe as 7 pedras do servidor
socket.on('receiveHand', (hand) => {
    meuId = socket.id; // Garante o ID atualizado
    desenharMao(hand);
});

function desenharMao(hand) {
    const handContainer = document.getElementById('player-hand');
    handContainer.innerHTML = ''; 
    
    hand.forEach(piece => {
        const div = document.createElement('div');
        div.className = 'domino-piece';
        div.innerHTML = `<div>${piece.ladoA}</div><div class="line"></div><div>${piece.ladoB}</div>`;
        
        div.onclick = () => {
            // TRAVA ESSENCIAL: Se não for a sua vez, o clique não faz nada!
            if (socket.id !== turnoDeQuem) {
                alert("Calma aí, parceiro! Espere a sua vez.");
                return;
            }

            socket.emit('jogarPedra', { 
                roomId: roomId, 
                pedra: piece, 
                ladoDaMesa: 'direita' 
            });
            div.remove(); 
        };
        
        handContainer.appendChild(div);
    });
}

// Atualiza a mesa e define quem joga agora
socket.on('atualizarMesa', (data) => {
    // Atualiza quem é o jogador da vez baseado no sinal do servidor
    turnoDeQuem = data.proximoTurno; 

    // Altera o visual para avisar se é a sua vez ou não
    const statusMesa = document.querySelector('.game-table p');
    if (socket.id === turnoDeQuem) {
        statusMesa.innerText = "SUA VEZ DE JOGAR! 🫵";
        statusMesa.style.color = "#00ff00";
    } else {
        statusMesa.innerText = "Aguardando o próximo jogador... ⏳";
        statusMesa.style.color = "rgba(255,255,255,0.5)";
    }

    // Redesenha as pedras na mesa
    const board = document.getElementById('board');
    board.innerHTML = ''; 
    
    data.mesa.forEach(pedra => {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'domino-piece';
        pieceDiv.style.transform = 'rotate(90deg)'; 
        pieceDiv.style.margin = '0 15px';
        pieceDiv.innerHTML = `<div>${pedra[0]}</div><div class="line"></div><div>${pedra[1]}</div>`;
        board.appendChild(pieceDiv);
    });
});

socket.on('errorMsg', (msg) => {
    alert(msg); 
});

function solicitarTranque() {
    const mockupHands = [
        { id: socket.id, pontos: 12 },
        { id: "p2", pontos: 22 },
        { id: "p3", pontos: 5 }, 
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