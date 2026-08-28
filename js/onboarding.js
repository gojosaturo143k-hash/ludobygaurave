// js/onboarding.js
// Phase 6: Player Name Onboarding

(function(){
  function $(id){ return document.getElementById(id); }

  function sanitizeName(raw){
    if (!raw) return '';
    let s = String(raw).trim();
    // remove angle brackets to prevent tag injection
    s = s.replace(/[<>]/g, '');
    // limit length
    if (s.length > 20) s = s.substring(0,20);
    return s;
  }

  function showOnboard(){
    const modal = $('onboardingModal');
    modal.style.display = 'flex';
    const input = $('onboardName');
    input.value = '';
    input.focus();
  }

  function hideOnboard(){
    const modal = $('onboardingModal');
    modal.style.display = 'none';
  }

  function updatePlayerInfoUI(){
    const name = localStorage.getItem('playerName');
    if (name && name.trim().length>0){
      $('playerInfo').style.display = 'block';
      $('playerInfoName').textContent = name;
      const pn = $('playerName'); if (pn) pn.value = name;
      // hidden fallback
      const nameFallback = document.getElementById('name'); if(nameFallback) nameFallback.value = name;
    } else {
      $('playerInfo').style.display = 'none';
    }
  }

  async function saveNameFlow(name){
    const clean = sanitizeName(name);
    const errEl = $('onboardError');
    if (!clean || clean.length < 2){ errEl.textContent = 'Name must be at least 2 characters'; errEl.style.display='block'; return false; }
    if (clean.length > 20){ errEl.textContent = 'Name must be 20 characters or fewer'; errEl.style.display='block'; return false; }
    errEl.style.display='none';

    // save locally
    localStorage.setItem('playerName', clean);
    // update existing inputs/fallbacks
    const pn = $('playerName'); if (pn) pn.value = clean;
    const nameFallback = document.getElementById('name'); if(nameFallback) nameFallback.value = clean;

    // If user is already in a room, update their name in the Firebase room (without creating duplicates)
    const roomCode = localStorage.getItem('roomCode');
    const playerUid = localStorage.getItem('playerUid');
    if (roomCode && window.FirebaseRoom && playerUid) {
      try {
        // joinRoom acts as an upsert: if playerUid already present it updates name/online
        await window.FirebaseRoom.joinRoom(roomCode, clean);
        console.log('[ONBOARD] updated name in Firebase room');
      } catch (e) { console.warn('[ONBOARD] failed to update name in Firebase room', e); }
    }

    updatePlayerInfoUI();
    hideOnboard();
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const existing = localStorage.getItem('playerName');
    // ensure hidden fallback inputs exist (index.js expects them)
    if(!document.getElementById('name')){
      const hid = document.createElement('input'); hid.type='hidden'; hid.id='name'; document.body.appendChild(hid);
    }
    if(!document.getElementById('room')){
      const hid2 = document.createElement('input'); hid2.type='hidden'; hid2.id='room'; document.body.appendChild(hid2);
    }

    updatePlayerInfoUI();

    if (!existing || existing.trim().length === 0){
      // block entry until name provided
      showOnboard();
    }

    // Save button
    $('onboardSave').addEventListener('click', async () => {
      const name = $('onboardName').value;
      await saveNameFlow(name);
    });

    // Allow Enter key
    $('onboardName').addEventListener('keyup', async (e) => {
      if (e.key === 'Enter') {
        const name = $('onboardName').value;
        await saveNameFlow(name);
      }
    });

    // Change name button
    const changeBtn = $('changeNameBtn');
    if (changeBtn){
      changeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const cur = localStorage.getItem('playerName') || '';
        $('onboardName').value = cur;
        $('onboardError').style.display='none';
        showOnboard();
      });
    }

  });

})();
