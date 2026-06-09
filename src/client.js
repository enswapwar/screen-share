const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
});

let localStream = null;
let peerConnection = null;

let selectedShare = null;
let currentRoom = null;

let shareName = "";
let sharePassword = "";

let lastViewedRoom = null;
let lastViewedPassword = "";

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

    if(peerConnection){
        peerConnection.close();
    }

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

        const remoteVideo =
            document.getElementById("remoteVideo");

        if(remoteVideo){
            remoteVideo.srcObject =
                event.streams[0];
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

shareName = name;
sharePassword = password;

        try{

    localStream =
        await navigator.mediaDevices
        .getDisplayMedia({
            video:true,
            audio:true
        });

    const videoTrack =
        localStream.getVideoTracks()[0];

    if(videoTrack){

        videoTrack.addEventListener(
            "ended",
            () => {

                socket.emit("share-stop", {
                    room:name
                });

                location.reload();

            }
        );

    }

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

    if(!localStream){
        return;
    }

    if(peerConnection){

        peerConnection.close();
        peerConnection = null;

    }

    createPeer();

    localStream
        .getTracks()
        .forEach(track => {

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

            lastViewedRoom = selectedShare;

    lastViewedPassword =
        document
        .getElementById(
            "viewPassword"
        )
        .value;
            
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

    if(peerConnection){

        peerConnection.close();
        peerConnection = null;

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

    if(!peerConnection){
        return;
    }

    try{

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
                data.answer
            )
        );

    }catch(err){

        console.error(
            "answer処理失敗",
            err
        );
        alert(
            "エラーが発生しました、consoleを参照してください。"
        )
    }

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

socket.on("share-ended", () => {

    alert("共有が終了しました");

    location.reload();

});


socket.on("disconnect", reason => {

    if(window.APP_MODE === "share"){

        setStatus(
            "通信切断...: " + reason
        );

    }

});

socket.on("reconnect", () => {

    if(
        window.APP_MODE === "share" &&
        localStream &&
        shareName
    ){

        setStatus("再接続中...");

        socket.emit("share-start", {
            name: shareName,
            password: sharePassword
        });

        setStatus("再接続成功");

    }

    if(
        window.APP_MODE === "view" &&
        lastViewedRoom
    ){

        setStatus("再接続中...");

        socket.emit("viewer-join", {
            room: lastViewedRoom,
            password: lastViewedPassword
        });

    }

});

socket.on("share-not-found", () => {

    alert("共有が見つかりません");

});
