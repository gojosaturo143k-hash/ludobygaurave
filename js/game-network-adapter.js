// js/game-network-adapter.js
// Connects ludo2.js gameplay to Firebase (host-authoritative)
// Phase 4: action dedupe, host failover, host initialization, turn validation

(function(){
  function whenReady(cb) {
    const wait = () => {
      // ludo2.js defines many globals; ensure basic ones are present
      if (window.FirebaseRoom && window.FirebaseGame && window.FirebaseAuth && document.readyState === 'complete') {
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
    console.log('[FIREBASE-HOST] adapter init; onlineMode=', onlineMode, 'room=', roomCode);

    // references to original functions (may be undefined in local-only flow)
    const orig_showDiceFromServer = window.showDiceFromServer;
    const orig_moveToken = window.moveToken;
    const orig_openToken = window.openToken;
    const orig_update = window.update;

    let isHost = false;
    let hostUnsubActions = null;
    let hostUnsubHostId = null;
    let clientUnsubGameState = null;

    // Utility: safe read of gameState
    async function loadGameState() {
      const state = await window.FirebaseGame.getGameStateOnce(roomCode);
      console.log('[FIREBASE-STATE] loadGameState', roomCode, !!state);
      return state;
    }

    async function loadPlayers() {
      const players = await window.FirebaseGame.getPlayersOnce(roomCode);
      return players;
    }

    // Validate action against current gameState and room
    async function validateAction(action, gameState, players) {
      // action: { _actionKey, type, uid, color, pieceId, timestamp }
      if (!action || !action.type) return { valid: false, reason: 'INVALID_ACTION' };
      if (!gameState) return { valid: false, reason: 'NO_GAME' };
      // check player exists
      const p = players && players[action.uid];
      if (!p) return { valid: false, reason: 'PLAYER_NOT_IN_ROOM' };
      if (!p.online) return { valid: false, reason: 'PLAYER_OFFLINE' };
      if (p.color !== action.color) return { valid: false, reason: 'COLOR_MISMATCH' };
      // validate turn-based actions
      if (action.type === 'ROLL_DICE' || action.type === 'MOVE_TOKEN') {
        if (gameState.currentTurnUid !== action.uid) return { valid: false, reason: 'NOT_YOUR_TURN' };
      }
      return { valid: true };
    }

    // Process an action as host (idempotent)
    async function processAction(action) {
      if (!action || !action._actionKey) return;
      const actionId = action._actionKey;
      console.log('[FIREBASE-HOST] processing action', actionId, action.type, action.uid);

      try {
        // dedupe: mark processed atomically
        const markRes = await window.FirebaseGame.markActionProcessed(roomCode, actionId);
        if (!markRes.success) {
          console.log('[FIREBASE-ACTION] action already processed or mark failed', actionId, markRes.error);
          return;
        }

        // load latest gameState and players for validation
        const [gameState, players] = await Promise.all([window.FirebaseGame.getGameStateOnce(roomCode), window.FirebaseGame.getPlayersOnce(roomCode)]);
        if (!gameState) {
          console.warn('[FIREBASE-HOST] no gameState present when processing action', action.type);
          // Depending on policy we may initialize only when safe; for now reject
          await window.FirebaseGame.writeEvent(roomCode, { type: 'ACTION_REJECTED', reason: 'NO_GAME', actionId });
          return;
        }

        // Prevent processing old/stale actions: if action.timestamp <= gameState.updatedAt then skip
        // Note: timestamps are server timestamps; to be safe, compare presence only if updatedAt exists
        if (gameState.updatedAt && action.timestamp && typeof action.timestamp === 'number') {
          if (action.timestamp <= gameState.updatedAt) {
            console.log('[FIREBASE-ACTION] stale action, ignoring', actionId);
            return;
          }
        }

        // validate
        const validation = await validateAction(action, gameState, players);
        if (!validation.valid) {
          console.warn('[FIREBASE-ACTION] invalid action', actionId, validation.reason);
          await window.FirebaseGame.writeEvent(roomCode, { type: 'ACTION_REJECTED', reason: validation.reason, actionId });
          return;
        }

        // At this point, action is accepted. Execute authoritative logic using existing ludo2.js functions.
        if (action.type === 'ROLL_DICE') {
          // host generates dice (do not trust client)
          const dice = Math.floor(Math.random() * 6) + 1;
          console.log('[FIREBASE-HOST] GENERATED DICE', dice);
          // Show dice on host UI
          try { orig_showDiceFromServer && orig_showDiceFromServer(dice); } catch (e) { console.error('[FIREBASE-HOST] showDice error', e); }
          // write event and update gameState diceValue
          await window.FirebaseGame.writeEvent(roomCode, { type: 'DICE_RESULT', uid: action.uid, color: action.color, diceValue: dice });
          await window.FirebaseGame.writeGameState(roomCode, Object.assign({}, gameState, { diceValue: dice, diceRolling: false }));
        } else if (action.type === 'MOVE_TOKEN') {
          // Host must ensure the token element exists and call the original moveToken handler on the host DOM
          const tokenId = action.pieceId || action.tokenId;
          const tokenEl = tokenId ? document.getElementById(tokenId) : null;
          if (!tokenEl) {
            console.warn('[FIREBASE-HOST] token element not found for move', tokenId);
            await window.FirebaseGame.writeEvent(roomCode, { type: 'ACTION_REJECTED', reason: 'TOKEN_NOT_FOUND', actionId });
            return;
          }
          try {
            // Call the original moveToken function in the context of the token element
            orig_moveToken && orig_moveToken.apply(tokenEl, []);
            // After host applies move, serialize pieces and update gameState
            const pieces = (function(){
              // quick serialization similar to previous adapter
              const colors=['red','green','yellow','blue'];
              const map={};
              colors.forEach(color=>{ map[color]=[]; for(let i=1;i<=4;i++){ const id=`${color}Token${i}`; const el=document.getElementById(id); if (!el||!el.parentElement) { map[color].push(0); continue; } const classes=Array.from(el.parentElement.classList||[]); let pos=0; for(const c of classes){ const prefix=color+'Path'; if(c.startsWith(prefix)){ const n=parseInt(c.substring(prefix.length)); if(!isNaN(n)){ pos=n; break; } } } if (el.parentElement.classList.contains('tokenHome')||el.parentElement.classList.contains(color+'Home')) pos=57; map[color].push(pos);} }); return map; })();
            await window.FirebaseGame.writeEvent(roomCode, { type: 'MOVE_APPLIED', uid: action.uid, color: action.color, pieceId: tokenId });
            await window.FirebaseGame.writeGameState(roomCode, Object.assign({}, gameState, { pieces: pieces }));
          } catch (err) {
            console.error('[FIREBASE-HOST] error during moveToken', err);
            await window.FirebaseGame.writeEvent(roomCode, { type: 'ACTION_ERROR', reason: err.message, actionId });
          }
        } else {
          console.warn('[FIREBASE-HOST] unknown action type', action.type);
        }

      } catch (err) {
        console.error('[FIREBASE-HOST] processAction error', err);
      }
    }

    // Host initialization when this client becomes host
    async function initAsHost() {
      console.log('[FIREBASE-FAILOVER] initAsHost start for', roomCode);
      // load latest gameState
      const state = await loadGameState();
      if (state) {
        // Reconstruct DOM to match canonical state
        console.log('[FIREBASE-FAILOVER] reconstructing board from gameState');
        try { window.FirebaseRenderer.reconstructFromState(state); } catch (e) { console.error('[FIREBASE-RENDER] reconstruct failed', e); }
      } else {
        // No gameState exists: only initialize if enough players
        const players = await loadPlayers();
        const playerCount = Object.keys(players || {}).length;
        if (playerCount >= 2) {
          // Initialize minimal gameState only if still null using transaction on gameState
          const rc = roomCode;
          const ref = firebase.database().ref(`rooms/${rc}/gameState`);
          try {
            await ref.transaction(curr => {
              if (curr === null) {
                // create safe initial state; do not overwrite existing
                return { started: true, turnNumber: 1, currentTurnUid: Object.keys(players)[0], currentTurnColor: (players[Object.keys(players)[0]]||{}).color || null, diceValue: null, pieces: { red:[0,0,0,0], green:[0,0,0,0], blue:[0,0,0,0], yellow:[0,0,0,0] }, lastActionId: null, updatedAt: firebase.database.ServerValue.TIMESTAMP };
              }
              return; // abort if exists
            }, undefined, false);
            console.log('[FIREBASE-FAILOVER] initialized gameState because it was missing');
          } catch (err) {
            console.error('[FIREBASE-FAILOVER] error initializing gameState', err);
          }
        } else {
          console.log('[FIREBASE-FAILOVER] not enough players to init gameState');
        }
      }

      // Start listening for actions as host
      if (hostUnsubActions) hostUnsubActions();
      hostUnsubActions = window.FirebaseGame.listenActionsAsHost(roomCode, async (action) => {
        try {
          // Only process actions intended for this room and that are not already marked
          if (!action || !action._actionKey) return;
          // process in sequence
          await processAction(action);
        } catch (err) { console.error('[FIREBASE-HOST] action handler error', err); }
      });

      console.log('[FIREBASE-HOST] host action listener started');
    }

    // Listen for host changes and start host mode if this client becomes host
    function watchHostChange() {
      const rc = roomCode;
      const ref = firebase.database().ref(`rooms/${rc}/hostId`);
      hostUnsubHostId = ref.on('value', async snap => {
        const newHost = snap.val();
        const uid = window.FirebaseAuth.getUid();
        console.log('[FIREBASE-FAILOVER] hostId changed to', newHost, 'my uid=', uid);
        if (newHost === uid) {
          isHost = true;
          await initAsHost();
        } else {
          if (isHost) {
            console.log('[FIREBASE-FAILOVER] I am no longer host, cleaning host listeners');
            if (hostUnsubActions) { hostUnsubActions(); hostUnsubActions = null; }
          }
          isHost = false;
        }
      });
    }

    // client-side gameState listener: render canonical state
    function startClientListeners() {
      if (clientUnsubGameState) clientUnsubGameState();
      clientUnsubGameState = window.FirebaseGame.listenGameState(roomCode, (state) => {
        try {
          if (!state) return;
          console.log('[FIREBASE-STATE] client received gameState update');
          if (state.diceValue) {
            orig_showDiceFromServer && orig_showDiceFromServer(state.diceValue);
          }
          if (state.pieces) {
            window.FirebaseRenderer.reconstructFromState(state);
          }
        } catch (err) {
          console.error('[FIREBASE-RENDER] apply gameState error', err);
        }
      });
    }

    // Initialize adapter
    async function init() {
      if (!onlineMode) {
        console.log('[FIREBASE-HOST] offline/local mode; adapter inert');
        return;
      }

      // start watching host changes
      watchHostChange();

      // determine if we are host now
      isHost = await window.FirebaseGame.isHost(roomCode);
      if (isHost) {
        await initAsHost();
      }

      // start client listener always
      startClientListeners();

      // ensure presence re-registration (on reload) - ensure players/{uid}/online = true and set onDisconnect
      try {
        const uid = window.FirebaseAuth.getUid();
        if (uid) {
          const playerOnlineRef = firebase.database().ref(`rooms/${roomCode}/players/${uid}/online`);
          await playerOnlineRef.set(true);
          playerOnlineRef.onDisconnect().set(false);
        }
      } catch (err) { console.error('[FIREBASE-GAME] presence error', err); }

      console.log('[FIREBASE-HOST] adapter init complete');
    }

    init();

    // cleanup before unload
    window.addEventListener('beforeunload', () => {
      if (hostUnsubActions) hostUnsubActions();
      if (hostUnsubHostId) firebase.database().ref(`rooms/${roomCode}/hostId`).off('value', hostUnsubHostId);
      if (clientUnsubGameState) clientUnsubGameState();
    });

  });

})();
