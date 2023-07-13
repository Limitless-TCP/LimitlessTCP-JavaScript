let { TCPClient } = require('../Limitless-TCP');

let tcpClient = new TCPClient('127.0.0.1', 1234);

tcpClient.connect();

tcpClient.on('connect', () => {
    tcpClient.emit({type: 'test', data: 'This is a test packet 1'});
    tcpClient.emit({type: 'test', data: 'This is a test packet 2'});
    tcpClient.emit('Yo 1');
    tcpClient.emit('Yo 2');
});

tcpClient.on('error', (err) => {
    console.log(err)
    //Handle error, heartbeat errors are formatted differently
});