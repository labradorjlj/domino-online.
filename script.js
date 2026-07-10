let socket;
let roomId = window.location.hash.substring(1) || "";
let meuId = "";
let turnoDeQuem = "";
let pontasDaMesa = [-1, -1]; 

document.addEventListener("DOMContentLoaded", () => {
    socket = io();
    setupSocketListeners();
});

function connectGame() {
    const nameInput = document.getElementById('player-name');
    const roomInput = document.getElementById('room-input-id');
    
    if(!nameInput) return;
    const name = nameInput.value.trim();
    if(!name) return alert("Digite um apelido!");
    
    if(roomInput) {
        const inputRoomId = roomInput.value.trim().toUpperCase();
        if (inputRoomId) roomId = inputRoomId;
    }

    document.querySelector('.input-group').classList.add('hidden');
    document.getElementById('lobby-info').classList.remove('hidden');

    meuId = socket.id; 
    socket.emit('joinRoom', { roomId, playerName: name });
}

function adicionarRobos() {
    if(socket) socket.emit('adicionarRobos', { roomId });
}

function pularVez() {
    if (!socket || socket.id !== turnoDeQuem) return;
    socket.emit('passarVez', { roomId });
}

function enviarVoto(opcao) {
    if(socket) socket.emit('castVote', { roomId, vote: opcao });
    document.getElementById('vote-modal').classList.add('hidden');
}

function copyCode() {
    navigator.clipboard.writeText(roomId);
    alert('Código copiado!');
}

// 🔢 FUNÇÃO ATUALIZADA: Retorna o número puro para renderização direta e limpa
function gerarHtmlFace(valor) {
    return `<div class="domino-half val-${valor}">${valor}</div>`;
}

function desenharMao(hand) {
    const handContainer = document.getElementById('player-hand');
    if (!handContainer) return;
    handContainer.innerHTML = ''; 
    
    hand.forEach(piece => {
        const div = document.createElement('div');
        div.className = 'domino-piece piece-vertical';
        div.innerHTML = `${gerarHtmlFace(piece.ladoA)}${gerarHtmlFace(piece.ladoB)}`;
        
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

function setupSocketListeners() {
    socket.on('initRoomId', (data) => {
        roomId = data.roomId;
        window.location.hash = roomId; 
        const roomCodeElement = document.getElementById('room-code');
        if (roomCodeElement) {
            roomCodeElement.innerHTML = `Código da Sala: <strong style="color: #ffcc00; font-size: 24px;">${roomId}</strong>`;
        }
    });

    socket.on('roomUpdated', (data) => {
        const countEl = document.getElementById('player-count');
        if(countEl) countEl.innerText = `Aguardando jogadores (${data.count}/4)...`;
        
        const jogadoresA = data.players.filter(p => p.dupla === 'A').map(p => p.name);
        const jogadoresB = data.players.filter(p => p.dupla === 'B').map(p => p.name);

        const lblA = document.getElementById('labels-dupla-a');
        const lblB = document.getElementById('labels-dupla-b');
        if(lblA) lblA.innerHTML = `🔵 <strong>Dupla A:</strong> ${jogadoresA.join(' e ') || 'Aguardando...'}`;
        if(lblB) lblB.innerHTML = `🟢 <strong>Dupla B:</strong> ${jogadoresB.join(' e ') || 'Aguardando...'}`;
    });

    socket.on('startVoting', () => {
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('vote-modal').classList.remove('hidden');
    });

    socket.on('voteProgress', (data) => {
        const voteStatus = document.getElementById('vote-status');
        if(voteStatus) voteStatus.innerText = `Votos: ${data.votedCount}/4`;
    });

    socket.on('votingFinished', () => {
        document.getElementById('vote-modal').classList.add('hidden');
    });

    socket.on('receiveHand', (hand) => {
        meuId = socket.id; 
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('vote-modal').classList.add('hidden');
        
