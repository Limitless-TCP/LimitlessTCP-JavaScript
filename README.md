# LimitlessTCP-JavaScript

This service is a wrapper for the TCP "Net" module.
It provides an easy way to create tcp client and server connections with the ability to create networks with ease.

Main features:
* Easy to setup
* Anti-Packet stacking
* Built in self auto updating connected and all sockets array
* No need to stringify or parse JSON's, the data you send is the data you receive, no annoying buffers
* No limits from tcp
* Built in heartbeats with timeout error
* Built in packet compression using ZLib
* Settings for each feature so you can setup the server YOUR way

A few things to watch out for:
* Both the client and the server must have heartbeats set to true for it to work

Required Modules:
* [Pako](https://github.com/nodeca/pako) (ZLib compression library)


# Getting started
## Client:
The setup for a client is very straight forward, you create a new instance of the TCPClient class and pass the address and port
of a tcp server into the constructor, you then run the connect() function to attempt to connect to the server.

```javascript
let {TCPClient} = require('Limitless-TCP');

let tcpClient = new TCPClient( str: address, num: port);
tcpClient.connect();

tcpClient.on( str: event, (callback) => {} );
tcpClient.emit(data);
```

### Events:
   * close
   * connect
   * data
   * drain
   * end
   * error
   * lookup

Refer to tcp docs for callback information

### Compatible with normal TCP
A Limitless-TCP Client is compatible with a normal TCP server, meaning that you are able to connect to a generic tcp server while using
Limitless-TCP's simple syntax. This however does remove the 'heartbeat', 'compression', and 'anti packet stacking'.
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
Note that the data returned is as a buffer because that is how tcp sends data, and the packets sent by the client are sent as stacked because they were sent too fast.

#### Client:

```javascript
let {TCPClient} = require('./Limitless-TCP');

let tcpClient = new TCPClient('127.0.0.1', 1234);

tcpClient.connect();

tcpClient.on('connect', () => {
    tcpClient.emit({type: 'test', data: 'This is a test packet 1'});
    tcpClient.emit({type: 'test', data: 'This is a test packet 2'});
    tcpClient.emit('Yo 1');
    tcpClient.emit('Yo 2');
});
```
This will not work the other way around, meaning you are not able to connect a normal tcp client to a Limitless TCP server.

## Server:
The server is where all the settings are setup, meaning if you want to disable a feature, this is where you set it up, the clients will abide by the settings specified
here.

```javascript
let {TCPServer} = require('Limitless-TCP');

/**
 * @param settings = { //Any null values will be set to true
 *     useHeartbeat: bool,
 *     useCompression: bool
 * }
 */
let tcpServer = new TCPServer( num: port, obj: settings )

tcpServer.listen();

tcpServer.on( str: event, null/socket: socket, (callback) => {} ); //If the socket field is null then it listens for tcpServer events instead of socket specific
tcpServer.emit( data, socket: socket );
```

### Connected Sockets and All Sockets:
There is a built-in, auto updating array with all the connected sockets and every socket that is and has been connected (In its runtime, a restart would reset this)
```javascript
let TCPServer; //Initialize and listen

let arr: connectedSockets  = TCPServer.connectedSockets;
let arr: allSockets        = TCPServer.allSockets;
```

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
    
Refer to tcp docs for callback information

# Heartbeat Timeout
There is a different error that is thrown when the heartbeats timeout. This error is the same on the server and the client.
```bash
TCPServiceError [Heartbeat Error]: The heartbeat counter has timed out
    at Timeout._onTimeout (Path\To\Limitless-TCP.js:225:43)
    at listOnTimeout (node:internal/timers:564:17)
    at process.processTimers (node:internal/timers:507:7) {
  Details: 'This socket has timed out from the server.'
}
```
