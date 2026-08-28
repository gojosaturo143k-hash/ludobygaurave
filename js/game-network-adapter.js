// js/game-network-adapter.js
// Connects ludo2.js gameplay to Firebase (host-authoritative)

(function(){
  // Wait until ludo2.js has been loaded and its globals are present
  function whenReady(cb) {
    const wait = () => {
      if (typeof window.rollDice !== 'undefined' && typeof window.moveToken !== 'undefined' && window.FirebaseRoom && window.FirebaseGame && window.FirebaseAuth) {
        cb();
      } else {
        setTimeout(wait, 200);
      }
    };
    wait();
  }

  whenReady(() => {
    const roomCode = (localStorage.getItem('roomCode') || '').toUpperCase();
    const playerUid = localStorage.getItem('playerUid') || window.FirebaseAuth.getUid();
    const playerColor = localStorage.getItem('playerColor') || null;
    const onlineMode = !!(roomCode && playerUid && playerColor);

    console.log('[game-network-adapter] onlineMode=', onlineMode, 'room=', roomCode);

    // references to original functions
    const orig_rollDice = window.rollDice;
    const orig_moveToken = window.moveToken;
    const orig_openToken = window.openToken;
    const orig_update = window.update;
    const orig_showDiceFromServer = window.showDiceFromServer;

    let isHost = false;
    let processingActionKey = null;

    async function determineHost() {
      try {
        isHost = await window.FirebaseRoom.isHost(roomCode);
        console.log('[game-adapter] isHost=', isHost);
      } catch (err) {
        console.warn('determineHost error', err);
        isHost = false;
      }
    }

    function serializePiecesFromDOM(){
      // Build pieces mapping according to DOM positions
      const colors=['red','green','yellow','blue'];
      const pieces={};
      colors.forEach(color=>{
        pieces[color]=[];
        for(let i=1;i<=4;i++){
          const id = `${color}Token${i}`;
          const el = document.getElementById(id);
          if (!el || !el.parentElement) { pieces[color].push(0); continue; }
          // find class name like redPathNN
          const classes = Array.from(el.parentElement.classList || []);
          let pos = 0;
          for(const c of classes){
            const prefix = color + 'Path';
            if (c.startsWith(prefix)){
              const num = parseInt(c.substring(prefix.length));
              if (!isNaN(num)) { pos = num; break; }
            }
          }
          // special: tokenHome or redHome detection
          if (el.parentElement.classList.contains('tokenHome') || el.parentElement.classList.contains(color+'Home')) pos = 57;
          pieces[color].push(pos);
        }
      });
      return pieces;
    }

    async function writeCanonicalState(partialState) {
      const state = Object.assign({}, partialState);
      // include pieces
      state.pieces = serializePiecesFromDOM();
      state.updatedAt = firebase.database.ServerValue.TIMESTAMP;
      await window.FirebaseGame.writeGameState(roomCode, state);
    }

    // override rollDice and moveToken to handle online mode
    window.rollDice = function(){
      if (!onlineMode) return orig_rollDice.apply(this, arguments);
      // if online
      if (isHost) {
        // host generates dice and calls host-side showDiceFromServer
        const dice = Math.floor(Math.random()*6)+1;
        console.log('[HOST] generated dice', dice);
        // call original UI function to show dice
        try { orig_showDiceFromServer.call(null, dice); } catch(e){ console.error(e); }
        // write event and provisional gameState diceValue
        window.FirebaseGame.writeEvent(roomCode, { type: 'DICE_RESULT', uid: window.FirebaseAuth.getUid(), color: playerColor, diceValue: dice });
        // Do not advance turn here; host will wait for MOVE_TOKEN action to apply move and then update gameState
        window.FirebaseGame.writeGameState(roomCode, { diceValue: dice, diceRolling: false });
      } else {
        // non-host: send action intent to Firebase
        window.FirebaseGame.sendAction(roomCode, { type: 'ROLL_DICE', color: playerColor });
      }
    };

    // override openToken/moveToken for non-host clients to only send action instead of moving locally
    window.openToken = function(){
      if (!onlineMode) return orig_openToken.apply(this, arguments);
      if (isHost) return orig_openToken.apply(this, arguments);
      // non-host: send MOVE_TOKEN with piece id
      const tokenId = this.id || (this.getAttribute && this.getAttribute('id')); // this refers to clicked element
      window.FirebaseGame.sendAction(roomCode, { type: 'MOVE_TOKEN', color: playerColor, pieceId: tokenId });
    };

    window.moveToken = function(){
      if (!onlineMode) return orig_moveToken.apply(this, arguments);
      if (isHost) {
        // host executes original movement (this must be the token element)
        const res = orig_moveToken.apply(this, arguments);
        return res;
      }
      // non-host: send action
      const tokenId = this.id || (this.getAttribute && this.getAttribute('id'));
      window.FirebaseGame.sendAction(roomCode, { type: 'MOVE_TOKEN', color: playerColor, pieceId: tokenId });
    };

    // wrap update() to detect end of host moves and then write canonical state
    window.update = function(){
      // call original
      const res = orig_update.apply(this, arguments);
      // if host and onlineMode and we recently processed an action, serialize and write gameState
      if (onlineMode && isHost) {
        try {
          // simple heuristic: after update, write pieces and clear diceValue if necessary
          const pieces = serializePiecesFromDOM();
          // build minimal state
          const minimalState = {
            started: true,
            pieces: pieces
          };
          // write gameState
          window.FirebaseGame.writeGameState(roomCode, minimalState);
        } catch (err) {
          console.error('error writing state after update', err);
        }
      }
      return res;
    };

    // host action processor
    async function processActionAsHost(action) {
      if (!action || !action.type) return;
      console.log('[host] processing action', action);
      const uid = action.uid;
      const color = action.color;
      if (action.type === 'ROLL_DICE') {
        // only accept if correct player - naive check by comparing color against currentTurn player in DOM is not present yet
        // We'll allow for now and generate dice
        const dice = Math.floor(Math.random()*6)+1;
        orig_showDiceFromServer.call(null, dice);
        await window.FirebaseGame.writeEvent(roomCode, { type: 'DICE_RESULT', uid, color, diceValue: dice });
        await window.FirebaseGame.writeGameState(roomCode, { diceValue: dice, diceRolling: false });
      } else if (action.type === 'MOVE_TOKEN') {
        // find token element by id (= pieceId)
        const tokenEl = document.getElementById(action.pieceId);
        if (tokenEl) {
          // call orig_moveToken in host context (click simulation)
          try {
            orig_moveToken.apply(tokenEl, []);
            // after movement, update canonical state
            const pieces = serializePiecesFromDOM();
            await window.FirebaseGame.writeEvent(roomCode, { type: 'MOVE_APPLIED', uid, color, pieceId: action.pieceId });
            await window.FirebaseGame.writeGameState(roomCode, { pieces: pieces });
          } catch (err) {
            console.error('host moveToken error', err);
          }
        }
      }
    }

    // listen for actions as host
    async function startHostLoop() {
      await determineHost();
      if (!isHost) return;
      console.log('[game-adapter] starting host action listener');
      window.FirebaseGame.listenActionsAsHost(roomCode, async (action) => {
        // simple dedupe: process every action
        await processActionAsHost(action);
      });
    }

    // client listener for gameState/ events
    function startClientListeners() {
      console.log('[game-adapter] startClientListeners for', roomCode);
      window.FirebaseGame.listenGameState(roomCode, (state) => {
        if (!state) return;
        // update UI: dice, pieces, current turn, winner etc
        try {
          if (state.diceValue) {
            // show dice animation via existing function
            orig_showDiceFromServer.call(null, state.diceValue);
          }
          if (state.pieces) {
            window.FirebaseRenderer.renderPieces(state.pieces);
          }
        } catch (err) {
          console.error('error applying gameState', err);
        }
      });
    }

    async function init() {
      if (!onlineMode) return;
      await determineHost();
      if (isHost) {
        // start listening for actions and process them
        startHostLoop();
      }
      // start client gameState listeners for everyone
      startClientListeners();
    }

    init();

  });

})();
