// js/firebase-renderer.js
// Reconciles DOM token positions to canonical gameState.pieces
// Improved for Phase 4: idempotent rendering and reconstructFromState

(function(){
  function findParentForPosition(color, index) {
    if (index === 0) return document.querySelector(`.${color}Path0`);
    if (index === 57) {
      // home slot - use the tokenHome with color id
      const home = document.querySelector(`.${color}Path57`) || document.querySelector(`#${color}Home`) || document.querySelector('.tokenHome');
      return home;
    }
    return document.querySelector(`.${color}Path${index}`);
  }

  function currentParentOfToken(tokenEl) {
    return tokenEl && tokenEl.parentElement ? tokenEl.parentElement : null;
  }

  function tokenAtParentMatches(tokenEl, color, index) {
    const parent = currentParentOfToken(tokenEl);
    if (!parent) return false;
    if (index === 57) return parent.classList.contains('tokenHome') || parent.classList.contains(`${color}Home`);
    // check for class like redPathNN
    const classes = Array.from(parent.classList || []);
    return classes.some(c => c === `${color}Path${index}`);
  }

  function placeTokenAt(color, tokenId, index) {
    try {
      const token = document.getElementById(tokenId);
      if (!token) return false;
      if (tokenAtParentMatches(token, color, index)) return true; // already correct
      const dest = findParentForPosition(color, index);
      if (!dest) return false;
      dest.appendChild(token);
      return true;
    } catch (err) {
      console.error('[FIREBASE-RENDER] placeTokenAt error', err);
      return false;
    }
  }

  // Render pieces object into DOM idempotently
  // pieces: { red: [pos,pos,pos,pos], green: [...], ... }
  function renderPieces(pieces) {
    if (!pieces) return;
    const colors = ['red','green','yellow','blue'];
    colors.forEach(color => {
      const arr = pieces[color] || [];
      for (let i=0;i<4;i++){
        const pos = (typeof arr[i] !== 'undefined' && arr[i] !== null) ? arr[i] : 0;
        const tokenId = `${color}Token${i+1}`; // id convention in DOM
        placeTokenAt(color, tokenId, pos);
      }
    });
  }

  // Reconstruct entire board from canonical state
  function reconstructFromState(state) {
    if (!state || !state.pieces) return;
    try {
      // Avoid duplicates: for every token id, ensure it's moved to the canonical parent
      renderPieces(state.pieces);
    } catch (err) {
      console.error('[FIREBASE-RENDER] reconstructFromState error', err);
    }
  }

  window.FirebaseRenderer = {
    renderPieces,
    placeTokenAt,
    reconstructFromState
  };

})();
