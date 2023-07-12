let { TCPServer } = require('../Limitless-TCP')

let tcpServer = new TCPServer(1234, true);

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