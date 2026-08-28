// js/firebase-game.js
// Low-level Firebase game networking primitives (no game rules)
// Depends on firebase compat SDK and window.FirebaseAuth

(function(){
  if (!window.firebase) {
    console.error('firebase-game: Firebase SDK not loaded');
    window.FirebaseGame = {
      getCurrentUid: () => null,
      isHost: async () => false,
      sendAction: async () => ({ success: false }),
      listenActionsAsHost: () => () => {},
      listenGameState: () => () => {},
      writeGameState: async () => ({ success: false }),
      writeEvent: async () => ({ success: false }),
      cleanup: () => {}
    };
    return;
  }

  const db = firebase.database();

  function getCurrentUid() {
    if (window.FirebaseAuth && window.FirebaseAuth.getUid) return window.FirebaseAuth.getUid();
    return null;
  }

  async function isHost(roomCode) {
    const rc = String(roomCode || '').toUpperCase();
    if (!rc) return false;
    try {
      const snap = await db.ref(`rooms/${rc}/hostId`).once('value');
      const hostId = snap.val();
      const uid = getCurrentUid();
      return uid && hostId === uid;
    } catch (err) {
      console.error('isHost error', err);
      return false;
    }
  }

  // sendAction: push action to /rooms/{roomCode}/actions
  async function sendAction(roomCode, action) {
    try {
      const rc = String(roomCode || '').toUpperCase();
      const uid = getCurrentUid();
      if (!rc) return { success: false, error: 'INVALID_ROOM' };
      if (!uid) return { success: false, error: 'AUTH_REQUIRED' };
      const payload = Object.assign({}, action, { uid, timestamp: firebase.database.ServerValue.TIMESTAMP });
      const ref = await db.ref(`rooms/${rc}/actions`).push(payload);
      return { success: true, actionId: ref.key };
    } catch (err) {
      console.error('sendAction error', err);
      return { success: false, error: err.message };
    }
  }

  // listenActionsAsHost: host listens for new actions (onChildAdded)
  function listenActionsAsHost(roomCode, handler) {
    const rc = String(roomCode || '').toUpperCase();
    const ref = db.ref(`rooms/${rc}/actions`);
    const cb = ref.on('child_added', snap => {
      const val = snap.val();
      const key = snap.key;
      handler(Object.assign({ _actionKey: key }, val));
    });
    return () => ref.off('child_added', cb);
  }

  // listenGameState: subscribe to /rooms/{roomCode}/gameState value changes
  function listenGameState(roomCode, handler) {
    const rc = String(roomCode || '').toUpperCase();
    const ref = db.ref(`rooms/${rc}/gameState`);
    const cb = ref.on('value', snap => {
      handler(snap.val());
    });
    return () => ref.off('value', cb);
  }

  // writeGameState: host writes canonical gameState (overwrite)
  async function writeGameState(roomCode, state) {
    try {
      const rc = String(roomCode || '').toUpperCase();
      const payload = Object.assign({}, state, { updatedAt: firebase.database.ServerValue.TIMESTAMP });
      await db.ref(`rooms/${rc}/gameState`).set(payload);
      return { success: true };
    } catch (err) {
      console.error('writeGameState error', err);
      return { success: false, error: err.message };
    }
  }

  // writeEvent: push event to events log
  async function writeEvent(roomCode, ev) {
    try {
      const rc = String(roomCode || '').toUpperCase();
      const payload = Object.assign({}, ev, { timestamp: firebase.database.ServerValue.TIMESTAMP });
      const ref = await db.ref(`rooms/${rc}/events`).push(payload);
      return { success: true, eventId: ref.key };
    } catch (err) {
      console.error('writeEvent error', err);
      return { success: false, error: err.message };
    }
  }

  function cleanup() {
    // placeholder for future cleanup of listeners
  }

  window.FirebaseGame = {
    getCurrentUid,
    isHost,
    sendAction,
    listenActionsAsHost,
    listenGameState,
    writeGameState,
    writeEvent,
    cleanup
  };

})();
