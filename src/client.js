const socket = io();

let localStream = null;
let peerConnection = null;

let selectedShare = null;
let currentRoom = null;

const statusEl = document.getElementById("status");

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};

function setStatus(text){
    if(statusEl){
        statusEl.textContent = text;
    }
}

function createPeer(){
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = event => {
        if(event.candidate){
            socket.emit("ice-candidate", {
                room: currentRoom,
                candidate: event.candidate
            });
        }
    };

    peerConnection.ontrack = event => {
        const remoteVideo = document.getElementById("remoteVideo");

        if(remoteVideo){
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onconnectionstatechange = () => {
        setStatus(
            "接続状態: " +
            peerConnection.connectionState
        );
    };

    return peerConnection;
}

if(window.APP_MODE === "share"){

    const shareBtn = document.getElementById("shareBtn");
    const stopBtn = document.getElementById("stopShareBtn");

    shareBtn.addEventListener("click", async () => {

        const name =
            document.getElementById("shareName")
            .value
            .trim();

        const password =
            document.getElementById("sharePassword")
            .value;

        if(!name){
            alert("名前を入力してください");
            return;
        }

        try{

            localStream =
                await navigator.mediaDevices
                .getDisplayMedia({
                    video:true,
                    audio:true
                });

            document
                .getElementById("localVideo")
                .srcObject = localStream;

            currentRoom = name;

            socket.emit("share-start", {
                name,
                password
            });

            shareBtn.disabled = true;
            stopBtn.disabled = false;

            setStatus("共有中");

            localStream
                .getVideoTracks()[0]
                .addEventListener("ended", () => {

                    socket.emit("share-stop", {
                        room:name
                    });

                    location.reload();
                });

        }catch(err){

            console.error(err);
            alert("共有がキャンセルされました");

        }

    });

    stopBtn.addEventListener("click", () => {

        if(localStream){

            localStream
                .getTracks()
                .forEach(track => track.stop());

        }

        socket.emit("share-stop", {
            room: currentRoom
        });

        location.reload();

    });

    socket.on("viewer-joined", async () => {

        createPeer();

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(
                track,
                localStream
            );
        });

        const offer =
            await peerConnection.createOffer();

        await peerConnection.setLocalDescription(
            offer
        );

        socket.emit("offer", {
            room: currentRoom,
            offer
        });

    });

}

if(window.APP_MODE === "view"){

    const shareList =
        document.getElementById("shareList");

    const selectedName =
        document.getElementById("selectedName");

    document
        .getElementById("refreshBtn")
        .addEventListener("click", () => {

            socket.emit("get-shares");

        });

    socket.emit("get-shares");

    socket.on("share-list", list => {

        shareList.innerHTML = "";

        list.forEach(item => {

            const div =
                document.createElement("div");

            div.className = "shareItem";

            div.innerHTML = `
                <div class="shareName">
                    ${item.name}
                    ${
                        item.locked
                        ? '<span class="shareLock">🔒</span>'
                        : ''
                    }
                </div>
            `;

            div.onclick = () => {

                document
                    .querySelectorAll(".shareItem")
                    .forEach(el => {
                        el.classList.remove(
                            "selected"
                        );
                    });

                div.classList.add("selected");

                selectedShare = item.name;

                selectedName.textContent =
                    item.name;

            };

            shareList.appendChild(div);

        });

    });

    document
        .getElementById("watchBtn")
        .addEventListener("click", () => {

            if(!selectedShare){
                alert("共有を選択してください");
                return;
            }

            currentRoom = selectedShare;

            socket.emit("viewer-join", {

                room:selectedShare,

                password:
                    document
                    .getElementById(
                        "viewPassword"
                    )
                    .value

            });

        });

}

socket.on("offer", async data => {

    if(window.APP_MODE !== "view"){
        return;
    }

    createPeer();

    await peerConnection
        .setRemoteDescription(
            new RTCSessionDescription(
                data.offer
            )
        );

    const answer =
        await peerConnection.createAnswer();

    await peerConnection
        .setLocalDescription(answer);

    socket.emit("answer", {
        room: currentRoom,
        answer
    });

});

socket.on("answer", async data => {

    if(window.APP_MODE !== "share"){
        return;
    }

    await peerConnection
        .setRemoteDescription(
            new RTCSessionDescription(
                data.answer
            )
        );

});

socket.on("ice-candidate", async data => {

    if(!peerConnection){
        return;
    }

    try{

        await peerConnection.addIceCandidate(
            new RTCIceCandidate(
                data.candidate
            )
        );

    }catch(err){

        console.error(err);

    }

});

socket.on("auth-failed", () => {

    alert("パスワードが違います");

});

socket.on("share-not-found", () => {

    alert("共有が見つかりません");

});
