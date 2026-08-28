// js/firebase-renderer.js
// Reconciles DOM token positions to canonical gameState.pieces

(function(){
  function parsePathIndexFromParent(elem, color) {
    if (!elem || !elem.parentElement) return 0;
    const parent = elem.parentElement;
    // find a class like redPathNN or greenPathNN etc
    const classes = Array.from(parent.classList || []);
    for (const c of classes) {
      const prefix = color + 'Path';
      if (c.startsWith(prefix)) {
        const num = parseInt(c.substring(prefix.length));
        if (!isNaN(num)) return num;
      }
    }
    // check tokenHome or start
    if (parent.classList.contains('tokenHome') || parent.classList.contains(color + 'Home')) return 57;
    if (parent.classList.contains('disks')) return 0;
    return 0;
  }

  function placeTokenAt(color, tokenId, index) {
    // tokenId is DOM id like redToken1
    try {
      const token = document.getElementById(tokenId);
      if (!token) return false;
      let selector = '';
      if (index === 0) {
        // start area
        selector = `.${color}Path0`;
      } else if (index === 57) {
        // home
        selector = `.${color}Path57`;
      } else {
        selector = `.${color}Path${index}`;
      }
      const dest = document.querySelector(selector);
      if (dest) {
        dest.appendChild(token);
        return true;
      }
    } catch (err) {
      console.error('placeTokenAt error', err);
    }
    return false;
  }

  // Render pieces object into DOM
  // pieces: { red: [pos,pos,pos,pos], green: [...], ... }
  function renderPieces(pieces) {
    if (!pieces) return;
    const colors = ['red','green','yellow','blue'];
    colors.forEach(color => {
      const arr = pieces[color] || [];
      for (let i=0;i<4;i++){
        const pos = arr[i] != null ? arr[i] : 0;
        const tokenId = `${color}Token${i+1}`; // id convention in DOM
        placeTokenAt(color, tokenId, pos);
      }
    });
  }

  window.FirebaseRenderer = {
    renderPieces,
    placeTokenAt
  };

})();
