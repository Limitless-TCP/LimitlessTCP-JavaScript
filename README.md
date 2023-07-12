# LimitlessTCP-JavaScript

This service is a wrapper for the TCP "Net" module.
It provides an easy way to create tcp client and server connections with the ability to create networks with ease.

Main features:
* Easy to setup
* Anti-Packet stacking
* No need to string or parse JSON's
* No limits from tcp
* Built in heartbeats with timeout error
* Built in packet compression using ZLib

A few things to watch out for:
* The 'heartbeat' and 'connect' packet under the object field 'tcpsType' is reserved if you have heartbeats enabled.
* The string '<PacketSplitter>' should not be used in and of your messages, it is a unique identifier for splitting stacked packets.
  If found it will be replaced with '<Redacted>'.
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