<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dominó do Boteco 🎴</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1a4329;
            color: white;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        h1 {
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }

        .hidden { display: none !important; }

        .card {
            background: rgba(0, 0, 0, 0.6);
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 450px;
            width: 100%;
            margin-top: 20px;
        }

        .input-group input {
            padding: 12px;
            width: 80%;
            border: none;
            border-radius: 6px;
            margin-bottom: 15px;
            font-size: 16px;
        }

        button {
            padding: 12px 24px;
            font-size: 16px;
            font-weight: bold;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
            margin: 5px;
        }

        button:active { transform: scale(0.98); }
        .btn-main { background-color: #ffcc00; color: #1a4329; }
        .btn-main:hover { background-color: #e6b800; }
        .btn-blue { background-color: #007bff; color: white; }
        .btn-blue:hover { background-color: #0056b3; }
        .btn-danger { background-color: #dc3545; color: white; }
        .btn-danger:hover { background-color: #bd2130; }

        .score-board {
            display: flex;
            justify-content: space-around;
            background: rgba(0,0,0,0.4);
            padding: 10px;
            border-radius: 8px;
            width: 100%;
            max-width: 600px;
            margin-bottom: 15px;
            font-size: 14px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        #game-screen {
            width: 100%;
            max-width: 800px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        #board {
            background-color: #143521;
            border: 3px dashed rgba(255,255,255,0.2);
            border-radius: 15px;
            min-height: 300px;
            width: 100%;
            padding: 20px;
            margin-bottom: 20px;
            box-sizing: border-box;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        #mesa-status {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            height: 24px;
        }

        .hand-container {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            border-radius: 10px;
            width: 100%;
            text-align: center;
        }

        #player-hand {
            display: flex;
            justify-content: center;
            gap: 12px;
            flex-wrap: wrap;
            min-height: 90px;
        }

        /* 🎲 PEDRAS UNIDAS (BLOCO INTEIRO) */
        .domino-piece {
            display: inline-flex;
            background: #ffffff; 
            border-radius: 8px;  
            box-shadow: 1px 3px 6px rgba(0,0,0,0.4);
            user-select: none;
            box-sizing: border-box;
            align-items: center;
            justify-content: center;
            padding: 2px;
            transition: transform 0.2s;
            border: 1px solid #bbb;
        }

        .domino-piece:hover {
            transform: scale(1.05);
            cursor: pointer;
        }

        .piece-vertical { flex-direction: column; }
        .piece-horizontal { flex-direction: row; }

        /* 🔢 METADES DA PEDRA COM OS NÚMEROS GROSSOS */
        .domino-half {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 42px !important;
            height: 42px !important;
            font-size: 26px !important; /* Tamanho grande */
            font-weight: 900 !important; /* Fonte bem grossa (Black) */
            color: #000000 !important; /* Cor preta nitida */
            background: transparent !important;
            box-sizing: border-box !important;
        }

        /* Linha divisória fina interna */
        .piece-vertical .domino-half:first-child {
            border-bottom: 1.5px solid rgba(0, 0, 0, 0.2) !important;
        }
        .piece-horizontal .domino-half:first-child {
            border-right: 1.5px solid rgba(0, 0, 0, 0.2) !important;
        }

        /* O número zero (Sena em branco) fica invisível ou vira traço sutil se preferir */
        .val-0 {
            color: transparent !important;
        }

        /* MODAL DE VOTAÇÃO */
        .modal {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.75);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content {
            background: #2e7d32;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
    </style>
</head>
<body>

    <h1>Dominó do Boteco 🎴</h1>

    <div id="lobby" class="card">
        <div class="input-group">
            <input type="text" id="player-name" placeholder="Teu Apelido..." maxlength="15">
            <input type="text" id="room-input-id" placeholder="Código da Sala (Opcional)">
            <button class="btn-main" onclick="connectGame()">Entrar na Sala</button>
        </div>

        <div id="lobby-info" class="hidden">
            <p id="room-code"></p>
            <button class="btn-main" style="padding: 6px 12px; font-size:12px;" onclick="copyCode()">Copiar Código</button>
            <hr style="border-color: rgba(255,255,255,0.1); margin: 20px 0;">
            <p id="player-count">Aguardando jogadores (0/4)...</p>
            
            <div style="text-align: left; margin: 15px auto; max-width: 300px;">
                <p id="labels-dupla-a">🔵 <strong>Dupla A:</strong> Aguardando...</p>
                <p id="labels-dupla-b">🟢 <strong>Dupla B:</strong> Aguardando...</p>
            </div>

            <button class="btn-blue" onclick="adicionarRobos()">Completar com Robôs 🤖</button>
        </div>
    </div>

    <div id="game-screen" class="hidden">
        <div class="score-board">
            <div>🔵 <strong>Dupla A:</strong> <span id="score-a">0</span> pontos</div>
            <div>🟢 <strong>Dupla B:</strong> <span id="score-b">0</span> pontos</div>
        </div>

        <div id="mesa-status">Aguardando início...</div>
        
        <div id="board"></div>

        <div style="margin-bottom: 20px;">
            <button id="btn-passar-vez" class="btn-danger hidden" onclick="pularVez()">Não tenho pedra (Passar Vez) ↩️</button>
        </div>

        <div class="hand-container">
            <div id="player-hand"></div>
        </div>
    </div>

    <div id="vote-modal" class="modal hidden">
        <div class="modal-content">
            <h2>Qual regra de abertura jogar?</h2>
            <p>Escolha como a primeira rodada deve iniciar:</p>
            <button class="btn-main" onclick="enviarVoto('6-6')">Quem tem o herna de 6 (6-6)</button>
            <button class="btn-main" onclick="enviarVoto('1-1')">Quem tem o herna de 1 (1-1)</button>
            <p id="vote-status" style="margin-top:15px; font-size:14px; opacity:0.8;">Votos: 0/4</p>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script src="script.js"></script>
</body>
</html>
