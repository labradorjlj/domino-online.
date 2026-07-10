const socket = io();
let roomId = window.location.hash.substring(1) || "";

let meuId = "";
let turnoDeQuem = "";
let pontasDaMesa = [-1, -1]; 

function connectGame() {
    const name = document.getElementById('player-name').value.trim();
    if(!name) return alert("Digite um apelido!");
    
    const inputRoomId = document.getElementById('room-input-id').value.trim().toUpperCase();
    if (inputRoomId) roomId = inputRoomId;

    document.querySelector('.input-group').classList.add('hidden');
    document.getElementById('lobby-info').classList.remove('hidden');

    meuId = socket.id; 
    socket.emit('joinRoom', { roomId, playerName: name });
}

function adicionarRobos() {
    socket.emit('adicionarRobos', { roomId });
}

socket.on('initRoomId', (data) => {
    roomId = data.roomId;
    window.location.hash = roomId; 
    const roomCodeElement = document.getElementById('room-code');
    if (roomCodeElement) {
        roomCodeElement.innerHTML = `Código da Sala: <strong style="color: #ffcc00; font-size: 24px;">${roomId}</strong>`;
    }
});

socket.on('roomUpdated', (data) => {
    document.getElementById('player-count').innerText = `Aguardando jogadores (${data.count}/4)...`;
    
    const jogadoresA = data.players.filter(p => p.dupla === 'A').map(p => p.name);
    const jogadoresB = data.players.filter(p => p.dupla === 'B').map(p => p.name);

    document.getElementById('labels-dupla-a').innerHTML = `🔵 <strong>Dupla A:</strong> ${jogadoresA.join(' e ') || 'Aguardando...'}`;
    document.getElementById('labels-dupla-b').innerHTML = `🟢 <strong>Dupla B:</strong> ${jogadoresB.join(' e ') || 'Aguardando...'}`;
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

// CRIA AS SUBDIVISÕES PARA O PADRÃO CLÁSSICO DE DADO
function gerarHtmlFace(valor) {
    return `
        <div class="domino-half val-${valor}">
            <div class="dot d1"></div><div class="dot d2"></div><div class="dot d3"></div>
            <div class="dot d4"></div><div class="dot d5"></div><div class="dot d6"></div>
            <div class="dot d7"></div><div class="dot d8"></div><div class="dot d9"></div>
        </div>
    `;
}

socket.on('receiveHand', (hand) => {
    meuId = socket.id; 
    desenharMao(hand);
});

function desenharMao(hand) {
    const handContainer = document.getElementById('player-hand');
    if (!handContainer) return;
    handContainer.innerHTML = ''; 
    
    hand.forEach(piece => {
        const div = document.createElement('div');
        div.className = 'domino-piece piece-vertical';
        div.innerHTML = `${gerarHtmlFace(piece.ladoA)}<div class="line-vert"></div>${gerarHtmlFace(piece.ladoB)}`;
        
        div.onclick = () => {
            if (socket.id !== turnoDeQuem) {
                alert("Não é sua vez!");
                return;
            }

            if (pontasDaMesa[0] === -1 && pontasDaMesa[1] === -1) {
                socket.emit('jogarPedra', { roomId, pedra: piece, ladoDaMesa: 'centro' });
                div.remove();
                return;
            }

            const { ladoA, ladoB } = piece;
            const encaixaEsquerda = (ladoA === pontasDaMesa[0] || ladoB === pontasDaMesa[0]);
            const encaixaDireita = (ladoA === pontasDaMesa[1] || ladoB === pontasDaMesa[1]);

            if (encaixaEsquerda && encaixaDireita) {
                const escolha = confirm(`Clique OK para DIREITA ou Cancelar para ESQUERDA.`);
                const ladoEscolhido = escolha ? 'direita' : 'esquerda';
                socket.emit('jogarPedra', { roomId, pedra: piece, ladoDaMesa: ladoEscolhido });
                div.remove();
            } else if (encaixaEsquerda) {
                socket.emit('jogarPedra', { roomId, pedra: piece, ladoDaMesa: 'esquerda' });
                div.remove();
            } else if (encaixaDireita) {
                socket.emit('jogarPedra', { roomId, pedra: piece, ladoDaMesa: 'direita' });
                div.remove();
            } else {
                alert("Essa pedra não encaixa nas pontas!");
            }
        };
        
        handContainer.appendChild(div);
    });
}

function pularVez() {
    if (socket.id !== turnoDeQuem) return;
    socket.emit('passarVez', { roomId });
}

// 🐍 RECONSTRUÇÃO DA MESA EM FORMATO SERPENTE ENCADEADA
socket.on('atualizarMesa', (data) => {
    turnoDeQuem = data.proximoTurno; 
    pontasDaMesa = data.pontas || [-1, -1]; 

    const scoreAEl = document.getElementById('score-a');
    const scoreBEl = document.getElementById('score-b');
    if (data.score && scoreAEl && scoreBEl) {
        scoreAEl.innerText = data.score.duplaA;
        scoreBEl.innerText = data.score.duplaB;
    }

    const btnPassar = document.getElementById('btn-passar-vez');
    const statusMesa = document.getElementById('mesa-status');
    
    if (statusMesa) {
        if (socket.id === turnoDeQuem) {
            statusMesa.innerText = pontasDaMesa[0] === -1 ? "SUA VEZ! Abra a rodada! 🃏" : "SUA VEZ! 🫵";
            statusMesa.style.color = "#00ff00";
            if (btnPassar) btnPassar.classList.remove('hidden');
        } else {
            statusMesa.innerText = `Vez de:
            
