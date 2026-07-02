const socket = io();
// Pega o código da sala atual se ele existir na URL
let roomId = window.location.hash.substring(1) || "";

let meuId = "";
let turnoDeQuem = "";
let pontasDaMesa = [-1, -1]; 

function connectGame() {
    const name = document.getElementById('player-name').value.trim();
    if(!name) return alert("Digite um apelido!");
    
    document.querySelector('.input-group').classList.add('hidden');
    document.getElementById('lobby-info').classList.remove('hidden');

    meuId = socket.id; 
    // Envia o roomId (vazio ou preenchido) para o servidor decidir
    socket.emit('joinRoom', { roomId, playerName: name });
}

// O servidor avisa qual sala foi criada/usada oficialmente
socket.on('initRoomId', (data) => {
    roomId = data.roomId;
    window.location.hash = roomId; // Atualiza a barra de endereço do navegador
    document.getElementById('room-code').innerText = window.location.href; // Atualiza o texto na tela
});

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

socket.on('receiveHand', (hand) => {
    meuId = socket.id; 
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

socket.on('atualizarMesa', (data) => {
    turnoDeQuem = data.proximoTurno; 
    pontasDaMesa = data.pontas || [-1, -1]; 

    if (data.score) {
        document.getElementById('score-a').innerText = data.score.duplaA;
        document.getElementById('score-b').innerText = data.score.duplaB;
    }

    const statusMesa = document.querySelector('.game-table p') || document.getElementById('mesa-status');
    if (statusMesa) {
        if (socket.id === turnoDeQuem) {
            if (pontasDaMesa[0] === -1) {
                statusMesa.innerText = "SUA VEZ! Abra a rodada com a pedra que quiser! 🃏";
            } else {
                statusMesa.innerText = "SUA VEZ DE JOGAR! 🫵";
            }
            statusMesa.style.color = "#00ff00";
        } else {
            statusMesa.innerText = "Aguardando o próximo jogador... ⏳";
            statusMesa.style.color = "rgba(255,255,255,0.5)";
        }
    }

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

socket.on('roundEnded', (data) => {
    alert(`FIM DA RODADA!\nMotivo: ${data.motivo}\n\nVitória da Dupla ${data.vencedor}!\nO placar foi atualizado. Nova rodada começando...`);
    document.getElementById('score-a').innerText = data.score.duplaA;
    document.getElementById('score-b').innerText = data.score.duplaB;
});

socket.on('errorMsg', (msg) => {
    alert(msg); 
});

function copyCode() {
    navigator.clipboard.writeText(window.location.href);
    alert('Link da sala copiado! Envie para seus parceiros de dupla.');
}
