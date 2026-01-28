// DOM elements
const redPlayer = document.querySelector(".redPlayer");
const greenPlayer = document.querySelector(".greenPlayer");
const yellowPlayer = document.querySelector(".yellowPlayer");
const bluePlayer = document.querySelector(".bluePlayer");
const play = document.querySelector("#play");
const menu = document.querySelector(".menuContainer");
const statusEl = document.getElementById("status");

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
