// DOM elements
const redPlayer = document.querySelector(".redPlayer");
const greenPlayer = document.querySelector(".greenPlayer");
const yellowPlayer = document.querySelector(".yellowPlayer");
const bluePlayer = document.querySelector(".bluePlayer");
const play = document.querySelector("#play");
const menu = document.querySelector(".menuContainer");
const statusEl = document.getElementById("status");

// Phase1 additions: localStorage persistence and firebase auth status hook
(function phase1_init() {
  // selectors in index.html
  const playerNameInput = document.getElementById('playerName');
  const roomCodeInput = document.getElementById('roomCode');

  // Ensure fallback hidden inputs #name and #room exist so existing code reading them won't throw
  function ensureHiddenFallbacks(){
    if(!document.getElementById('name')){
      const hid = document.createElement('input'); hid.type='hidden'; hid.id='name'; document.body.appendChild(hid);
    }
    if(!document.getElementById('room')){
      const hid2 = document.createElement('input'); hid2.type='hidden'; hid2.id='room'; document.body.appendChild(hid2);
    }
  }
  ensureHiddenFallbacks();

  // Prefill playerName from localStorage
  if (playerNameInput) {
    const saved = localStorage.getItem('playerName');
    if (saved) {
      playerNameInput.value = saved;
      const nameFallback = document.getElementById('name'); if(nameFallback) nameFallback.value = saved;
    }
  }

  // Prefill roomCode from localStorage
  if (roomCodeInput) {
    const savedRoom = localStorage.getItem('roomCode');
    if (savedRoom) {
      roomCodeInput.value = savedRoom;
      const roomFallback = document.getElementById('room'); if(roomFallback) roomFallback.value = savedRoom;
    }
  }

  // Save playerName and roomCode to localStorage when Play is clicked (capture to run before existing handlers)
  const playBtn = document.getElementById('play') || document.querySelector('#play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const nameVal = (playerNameInput && playerNameInput.value) ? playerNameInput.value.trim() : '';
      const roomVal = (roomCodeInput && roomCodeInput.value) ? roomCodeInput.value.trim() : '';
      if (nameVal) localStorage.setItem('playerName', nameVal);
      if (roomVal) localStorage.setItem('roomCode', roomVal);
      const nameFallback = document.getElementById('name'); if(nameFallback) nameFallback.value = nameVal;
      const roomFallback = document.getElementById('room'); if(roomFallback) roomFallback.value = roomVal;
    }, { capture: true });
  }

  // Hook to Firebase anonymous auth status if firebase-init loaded
  if (window.FirebaseAuth && typeof window.FirebaseAuth.onAuthReady === 'function') {
    window.FirebaseAuth.onAuthReady((user) => {
      try {
        const statusEl = document.getElementById('status');
        if (statusEl && user) {
          const shortUid = user.uid ? user.uid.slice(0,8) : 'anon';
          statusEl.innerText = (statusEl.innerText ? statusEl.innerText + ' | ' : '') + `Firebase: signed in (${shortUid})`;
        }
      } catch (e) {
        console.warn('firebase-auth status update failed', e);
      }
    });
  }
})();


// Audio
const click = new Audio('mixkit-classic-click-1117.wav');

// Player info (ONLY ONE PLAYER)
let selectedColor = null;

// COLOR SELECT (sirf ek)
[redPlayer, greenPlayer, yellowPlayer, bluePlayer].forEach(player => {
    player.addEventListener("click", () => {
        click.play();

        // remove old selection
        document.querySelectorAll(".players").forEach(p =>
            p.classList.remove("selected")
        );

        // add new
        player.classList.add("selected");
        selectedColor = player.id; // redPlayer / greenPlayer etc
    });
});


// PLAY BUTTON
play.addEventListener("click", () => {
    const name = document.querySelector("#name").value;
    const room = document.querySelector("#room").value;

    ws.send(JSON.stringify({
        type: "JOIN_ROOM",
        name,
        room
    }));

    status.innerText = "Joining room...";
});

    // 🔥 SERVER KO JOIN REQUEST
    ws.send(JSON.stringify({
        type: "JOIN_ROOM",
        name: name,
        room: room,
        color: selectedColor
    }));
});


// SERVER RESPONSE
ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    console.log("Server:", data);

    if (data.type === "JOIN_SUCCESS") {
        statusEl.innerText = "Joined room ✅";

        // menu close animation (safe)
        menu.style.animation = "closing 0.5s linear";

        setTimeout(() => {
            menu.style.display = "none";

            // 👉 multiplayer game page
            window.location.href = "ludo.html";
        }, 500);
    }

    if (data.type === "ERROR") {
        alert(data.message);
        statusEl.innerText = data.message;
    }

    if (data.type === "ROOM_FULL") {
        alert("Room full hai ❌");
        statusEl.innerText = "Room full ❌";
    }

};
