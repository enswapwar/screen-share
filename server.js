const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

const PORT = process.env.PORT || 3000;

const shares = new Map();

app.use("/src", express.static("src"));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.get("/admin", (req, res) => {
    res.sendFile(__dirname + "/admin.html");
});

io.on("connection", socket => {

    socket.on("share-start", data => {

        shares.set(data.name, {
            name: data.name,
            password: data.password || "",
            ownerSocketId: socket.id
        });

        socket.join(data.name);

    });

    socket.on("share-stop", data => {

        shares.delete(data.room);

        io.to(data.room).emit(
            "share-ended"
        );

    });

    socket.on("get-shares", () => {

        const list = [];

        for(const room of shares.values()){

            list.push({
                name: room.name,
                locked:
                    room.password.length > 0
            });

        }

        socket.emit(
            "share-list",
            list
        );

    });

    socket.on("viewer-join", data => {

        const room =
            shares.get(data.room);

        if(!room){

            socket.emit(
                "share-not-found"
            );

            return;

        }

        if(
            room.password &&
            room.password !== data.password
        ){

            socket.emit(
                "auth-failed"
            );

            return;

        }

        socket.join(data.room);

        io.to(room.ownerSocketId)
            .emit(
                "viewer-joined"
            );

    });

    socket.on("offer", data => {

        socket.to(data.room)
            .emit("offer", {
                offer: data.offer
            });

    });

    socket.on("answer", data => {

        socket.to(data.room)
            .emit("answer", {
                answer: data.answer
            });

    });

    socket.on(
        "ice-candidate",
        data => {

            socket.to(data.room)
                .emit(
                    "ice-candidate",
                    {
                        candidate:
                            data.candidate
                    }
                );

        }
    );

    socket.on("disconnect", () => {

        for(
            const [name, room]
            of shares.entries()
        ){

            if(
                room.ownerSocketId ===
                socket.id
            ){

                shares.delete(name);

                io.to(name)
                    .emit(
                        "share-ended"
                    );

            }

        }

    });

});

server.listen(PORT, () => {

    console.log(
        "Server started on port サーバーが起動しました、ポートは",
        PORT
    );

});
