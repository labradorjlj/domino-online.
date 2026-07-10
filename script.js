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

function escolherParceiro(idParceiro) {
    if(socket) {
        socket.emit('escolherParceiro', { roomId, escolheuId: idParceiro });
        document.getElementById('partner-options').innerHTML = "<p>Escolha registrada! Aguardando os outros...</p>";
    }
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

function gerarHtmlFace(valor) {
    const textoExibido = valor === 0 ? "-" : valor;
    return `<div class="domino-half val-${valor}">${textoExibido}</div>`;
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

    // Fase de escolha de parceiros recebida
    socket.on('abrirEscolhaParceiro', (data) => {
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('partner-screen').classList.remove('hidden');
        
        const container = document.getElementById('partner-options');
        container.innerHTML = '';
        
        // Renderiza apenas os outros jogadores para escolher
        data.outrosJogadores.forEach(p => {
            const btn = document.createElement('button');
            btn.className = 'btn-main partner-btn';
            btn.innerText = p.name;
            btn.onclick = () => escolherParceiro(p.id);
            container.appendChild(btn);
        });
    });

    socket.on('atualizarStatusParceiros', (data) => {
        const status = document.getElementById('partner-status');
        if(status) status.innerText = `Votos registrados: ${data.votosCount}/4`;
    });

    socket.on('startVoting', () => {
        document.getElementById('partner-screen').classList.add('hidden');
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
        document.getElementById('partner-screen').classList.add('hidden');
        document.getElementById('vote-modal').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        desenharMao(hand);
    });

    socket.on('atualizarMesa', (data) => {
        turnoDeQuem = data.proximoTurno; 
        pontasDaMesa = data.pontas || [-1, -1]; 

        // Atualiza os nomes reais das duplas no Placar do Topo
        if(data.nomesDuplas) {
            document.getElementById('title-dupla-a').innerHTML = `<strong>Dupla A (${data.nomesDuplas.duplaA})</strong>`;
            document.getElementById('title-dupla-b').innerHTML = `<strong>Dupla B (${data.nomesDuplas.duplaB})</strong>`;
        }

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
                statusMesa.innerText = `Vez de: ${data.nameTurnoAtual || 'Aguardando...'} ⏳`;
                statusMesa.style.color = "rgba(255,255,255,0.7)";
                if (btnPassar) btnPassar.classList.add('hidden');
            }
        }

        const board = document.getElementById('board');
        if (!board) return; 
        board.innerHTML = ''; 

        board.style.display = 'flex';
        board.style.flexDirection = 'row';
        board.style.flexWrap = 'wrap';
        board.style.justifyContent = 'center';
        board.style.alignItems = 'center';
        board.style.gap = '8px';

        if (data.mesa && Array.isArray(data.mesa) && data.mesa.length > 0) {
            let correnteVisual = [];

            data.mesa.forEach((pedra, index) => {
                if (index === 0) {
                    correnteVisual.push({ ladoA: pedra[0], ladoB: pedra[1] });
                } else {
                    let ultimaPedra = correnteVisual[correnteVisual.length - 1];
                    
                    if (pedra[0] === ultimaPedra.ladoB) {
                        correnteVisual.push({ ladoA: pedra[0], ladoB: pedra[1] });
                    } else if (pedra[1] === ultimaPedra.ladoB) {
                        correnteVisual.push({ ladoA: pedra[1], ladoB: pedra[0] });
                    } else if (pedra[0] === correnteVisual[0].ladoA) {
                        correnteVisual.unshift({ ladoA: pedra[1], ladoB: pedra[0] });
                    } else {
                        correnteVisual.unshift({ ladoA: pedra[0], ladoB: pedra[1] });
                    }
                }
            });

            correnteVisual.forEach((pedra) => {
                const pieceDiv = document.createElement('div');
                
                if (pedra.ladoA === pedra.ladoB) {
                    pieceDiv.className = 'domino-piece piece-vertical';
                } else {
                    pieceDiv.className = 'domino-piece piece-horizontal';
                }
                pieceDiv.innerHTML = `${gerarHtmlFace(pedra.ladoA)}${gerarHtmlFace(pedra.ladoB)}`;
                board.appendChild(pieceDiv);
            });
        }
    });

    socket.on('roundEnded', (data) => {
        alert(`FIM DA RODADA!\n\n${data.motivo}\n\nVitória da Dupla ${data.vencedor}!`);
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
    });
}
