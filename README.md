# LimitlessTCP-JavaScript

This service is a wrapper for the TCP "Net" module.
It provides an easy way to create tcp client and server connections with the ability to create networks with ease.

Main features:
* Easy to setup
* Anti-Packet stacking
* No need to stringify or parse JSON's, the data you send is the data you receive, no annoying buffers
* No limits from tcp
* Built in heartbeats with timeout error
* Built in packet compression using ZLib

A few things to watch out for:
* Both the client and the server must have heartbeats set to true for it to work

Required Modules:
* [Pako](https://github.com/nodeca/pako) (ZLib compression library)


# Getting started
## Client:
```javascript
let { TCPClient } = require('TCPService');

let tcpClient = new TCPClient(str: address, num: port, bool: useHeartbeat);
tcpClient.connect();
    
tcpClient.on(str: event, (callback) => {});
tcpClient.emit(data);
```

//Refer to tcp docs for callback information
### Events:
   * close
   * connect
   * data
   * drain
   * end
   * error
   * lookup

### Compatible with normal TCP
#### Server:
```javascript
let net = require('net');

let server = net.createServer();

server.listen(1234, () => {});

server.on('connection', (socket) => {
    socket.on('data', (data) => {
        console.log(data.toString());
    });
});
```

#### Client:
```javascript
let { TCPClient } = require('./TCPService');

let tcpClient = new TCPClient('127.0.0.1', 1234, true);

tcpClient.connect();

tcpClient.on('connect', () => {
    console.log('s')
    tcpClient.emit({type: 'test', data: 'This is a test packet 1'});
    tcpClient.emit({type: 'test', data: 'This is a test packet 2'});
    tcpClient.emit('Yo 1');
    tcpClient.emit('Yo 2');
});
```

Because the server isn't an instance of Limitless-TCP, the client will not use heartbeats, compression, or packet splitting. It will work as a normal tcp client.
This however does not work the other way, a normal tcp client will not be compatible with a Limitless-TCP server

## Server:
```javascript
let { TCPServer } = require('TCPService');

let tcpServer = new TCPServer(num: port, bool: useHeartbeat)
tcpServer.listen();

tcpServer.on(str: event, null/socket: socket, (callback) => {}); //If null then it listens for tcpServer events instead of socket specific
tcpServer.emit(data, socket: socket);
```

//Refer to tcp docs for callback information
### Events:
  * Server:
    * connect
    * error
    * close
  * Client:
    * close
    * data
    * drain
    * end
    * error
    * lookup