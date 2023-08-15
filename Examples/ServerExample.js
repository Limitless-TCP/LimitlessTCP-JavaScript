let { TCPServer } = require('../Limitless-TCP');

let settings = {
    useHeartbeat: true,
    useCompression: false,
    useChunking: true
}

let tcpServer = new TCPServer(1234, settings); //The settings here will be applied to any clients that connect to the server

let str = "";


// for (let i = 0; i < 10000000; i++) {
//     str += rand_str_without_O0();
// }
// console.log(str.length);

tcpServer.listen(() => {});

//Set to null because it is listening for a server event
tcpServer.on('connection', (socket) => {
    socket.write({ test: str });

    socket.on('data', (data) => {
        console.log(data)
    });

    socket.on('error', (err) => {
        console.log(err)
        //Handle error, heartbeat errors are formatted differently and are per socket
    });
});

tcpServer.on('error', (err) =>{
    //Handle error, heartbeat errors dont appear here
});

function rand_str_without_O0() {
    const list = "ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789~`!@#$%^&*()_-+=}]{[|\"\\':;?/>.<,";
    var res = "";
    for(var i = 0; i < 12; i++) {
        var rnd = Math.floor(Math.random() * list.length);
        res = res + list.charAt(rnd);
    }
    return res;
}