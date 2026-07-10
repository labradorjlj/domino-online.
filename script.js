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

// Helper clássico para gerar os 9 pontos internos da face do dominó
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
        
        // Aplica o grid de pontos pretos clássicos nas faces
        div.innerHTML = `${gerarHtmlFace(piece.ladoA)}<div class="line-vert"></div>${gerarHtmlFace(piece.ladoB)}`;
        
        div.onclick = () => {
            if (socket.id !== turnoDeQuem) {
                alert("Calma aí, parceiro! Espere a sua vez.");
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
                const escolha = confirm(`Essa pedra encaixa nos dois lados!\n\nClique em OK para jogar na DIREITA\nou Cancelar para jogar na ESQUERDA.`);
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
                alert("Essa pedra não encaixa nas pontas da mesa!");
            }
        };
        
        handContainer.appendChild(div);
    });
}

function pularVez() {
    if (socket.id !== turnoDeQuem) return;
    socket.emit('passarVez', { roomId });
}

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
            statusMesa.innerText = pontasDaMesa[0] === -1 ? "SUA VEZ! Abra a rodada! 🃏" : "SUA VEZ DE JOGAR! 🫵";
            statusMesa.style.color = "#00ff00";
            if (btnPassar) btnPassar.classList.remove('hidden');
        } else {
            statusMesa.innerText = `Vez de: ${data.nomeTurnoAtual || 'Aguardando...'} ⏳`;
            statusMesa.style.color = "rgba(255,255,255,0.5)";
            if (btnPassar) btnPassar.classList.add('hidden');
        }
    }

    const board = document.getElementById('board');
    if (!board) return; 
    
    board.innerHTML = ''; 

    let currentX = 40; 
    let currentY = 30;
    let direcao = 0; 
    let contadorSegmento = 0;

    if (data.mesa && Array.isArray(data.mesa)) {
        data.mesa.forEach((pedra) => {
            const pieceDiv = document.createElement('div');
            
            if (direcao === 0 || direcao === 2) {
                pieceDiv.className = 'domino-piece piece-horizontal';
                pieceDiv.innerHTML = `${gerarHtmlFace(pedra[0])}<div class="line-horiz"></div>${gerarHtmlFace(pedra[1])}`;
                
                pieceDiv.style.position = 'absolute';
                pieceDiv.style.left = `${currentX}px`;
                pieceDiv.style.top = `${currentY}px`;
                
                currentX += (direcao === 0) ? 76 : -76;
            } else {
                pieceDiv.className = 'domino-piece piece-vertical';
                pieceDiv.innerHTML = `${gerarHtmlFace(pedra[0])}<div class="line-vert"></div>${gerarHtmlFace(pedra[1])}`;
                
                pieceDiv.style.position = 'absolute';
                pieceDiv.style.left = `${direcao === 1 ? currentX - 76 + 20 : currentX + 76 - 20}px`;
                pieceDiv.style.top = `${currentY}px`;
                
                currentY += 76;
            }

            board.appendChild(pieceDiv);
            contadorSegmento++;

            if (direcao === 0 && contadorSegmento === 6) {
                direcao = 1; 
                contadorSegmento = 0;
                currentY += 40; 
            } else if (direcao === 1 && contadorSegmento === 2) {
                direcao = 2; 
                contadorSegmento = 0;
                currentX -= 36;
            } else if (direcao === 2 && contadorSegmento === 6) {
                direcao = 3; 
                contadorSegmento = 0;
                currentY += 40;
            } else if (direcao === 3 && contadorSegmento === 2) {
                direcao = 0; 
                contadorSegmento = 0;
                currentX += 36;
            }
        });
    }
});

socket.on('roundEnded', (data) => {
    alert(`FIM DA RODADA!\n\n${data.motivo}\n\nVitória da Dupla ${data.vencedor}!`);
    const scoreAEl = document.getElementById('score-a');
    const scoreBEl = document.getElementById('score-b');
    if (scoreAEl && scoreBEl) {
        scoreAEl.innerText = data.score.duplaA;
        scoreBEl.innerText = data.score.duplaB;
    }
});

socket.on('errorMsg', (msg) => {
    alert(msg); 
    if (msg.includes('cheia')) {
        window.location.hash = "";
        roomId = "";
        const inputGroup = document.querySelector('.input-group');
        const lobbyInfo = document.getElementById('lobby-info');
        if (inputGroup) inputGroup.classList.remove('hidden');
        if (lobbyInfo) lobbyInfo.classList.add('hidden');
    }
});

function copyCode() {
    navigator.clipboard.writeText(roomId);
    alert('Código da sala copiado: ' + roomId);
}
