let { TCPServer } = require('../Limitless-TCP');

let settings = {
    useHeartbeat: true,
    useCompression: true
}

let tcpServer = new TCPServer(1234, settings); //The settings here will be applied to any clients that connect to the server

tcpServer.listen();

//Set to null because it is listening for a server event
tcpServer.on('connect', null, (socket) => {

    tcpServer.on('data', socket, (data) => {
        console.log(data)
    });

    tcpServer.on('error', socket, (err) => {
        //Handle error, heartbeat errors are formatted differently and are per socket
    });
});

tcpServer.on('error', null, (err) =>{
    //Handle error, heartbeat errors dont appear here
});