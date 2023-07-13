/**
 * This service is a wrapper for the TCP "Net" module.
 * It provides an easy way to create tcp client and server connections with the ability to create networks with ease.
 *
 * Please refer to the JS docs for more information:
 * https://github.com/Limitless-TCP/LimitlessTCP-JavaScript/blob/master/README.md
 */

const net                                      = require('net');
const crypto                                    = require('crypto');

class TCPClient {

    constructor(address, port) {

        this.isServerAnInstance = false;

        this.useHeartbeat = false;
        this.useCompression = false;
        this.useChunking = false;

        this.port = port;
        this.address = address;

        this.socket = new net.Socket;
    }

    connect(callback) {
        this.socket.connect(this.port, this.address, cb => {
            if (callback !== null) {
                callback(cb);
            }

            this.localAddress = this.socket.address().address;
            this.localPort = this.socket.address().port;

            this.socket.on('data', (dataBuffer) => {
                let splitPackets = dataBuffer.toString().split('<PacketSplitter>');

                for (let packet of splitPackets) {
                    if (packet.length !== 0) {
                        try { //Try to parse, if error it isn't a json
                            packet = JSON.parse(packet)

                            switch (packet.type) {
                                case 'tcpsjs-heartbeat':
                                    this.lastHeartbeat = Date.now();
                                    break;

                                case 'tcpsjs-connect':
                                    this.isServerAnInstance = true;

                                    if (packet.data.useHeartbeat) {
                                        this.useHeartbeat = true;
                                        this.startHeartbeat();
                                        this.lastHeartbeat = Date.now();
                                    }

                                    if (packet.data.useCompression) {
                                        this.pako = require('pako');
                                        this.useCompression = true;
                                    }

                                    if (packet.data.useChunking) {
                                        this.useChunking = true;
                                    }
                                    break;
                            }
                        } catch (e) {
                        }
                    }
                }
            });

            this.socket.on('close', () => {
                this.socket.destroy();
                if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                    clearInterval(this.heartbeatInterval);
                }
            });

            this.socket.on('end', () => {
                this.socket.destroy();
                if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                    clearInterval(this.heartbeatInterval);
                }
            });
        });

        return this;
    }

    emit(data) {
        try {
            data = JSON.stringify(data);
        }catch (e) {}

        if (this.isServerAnInstance) {
            if (this.useCompression) {
                this.socket.write(JSON.stringify({ type: 'tcpsjs-packet', data: Buffer.from(pako.deflate(data)) }) + '<PacketSplitter>');
            }else {
                this.socket.write(JSON.stringify({ type: 'tcpsjs-packet', data: data }) + '<PacketSplitter>');
            }

        }else {
            this.socket.write(data);
        }
    }

    on(event, callback) {
        switch(event.toLowerCase()) {
            case 'close':
                console.log('s');
                this.socket.end();
                this.socket.on('close', callback);
                break;

            case 'connection':
            case 'connect':
                this.socket.on('connect', cb => {
                    setTimeout(() => { //Wait for the connection packet
                        callback(cb);
                    }, 20);
                });
                break;

            case 'data':
                //This will attempt to split incoming packets then return them each in a callback
                this.socket.on('data', (dataBuffer) => {
                    if (this.isServerAnInstance) {
                        let splitPackets = dataBuffer.toString().split('<PacketSplitter>');

                        for (let packet of splitPackets) {
                            if (packet.length !== 0) {
                                packet = JSON.parse(packet);
                                if (packet.type === 'tcpsjs-packet') {

                                    let packetData;

                                    if (this.useCompression) {
                                        packetData = Buffer.from(pako.inflate(new Uint8Array(Buffer.from(packet.data.data)))).toString();
                                    }else {
                                        packetData = packet.data.toString();
                                    }

                                    try { //Try to parse, if error it isn't a json
                                        packetData = JSON.parse(packetData)
                                    }catch (e) {}

                                    //Returns a packet and a function to reply
                                    callback(packetData);
                                }
                            }
                        }
                    }else {
                        callback(dataBuffer);
                    }
                });
                break;

            case 'drain':
                this.socket.on('data', callback);
                break;

            case 'end':
                this.socket.on('end', callback);
                break;

            case 'error':
                this.socket.on('error', callback);
                break;

            case 'lookup':
                this.socket.on('lookup', callback);
                break;

            default:
                console.log("There was an issue listening to the event '" + event + "'");

                callback(null);
                break;
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.lastHeartbeat + 8000 <= Date.now()) {
                this.socket.emit('error', new TCPServiceError(ErrorType.HEARTBEAT, 'This socket has timed out from the server.'));
                this.socket.destroy();
                clearInterval(this.heartbeatInterval);
            }
        }, 1000)
    }
}


class TCPServer {

    /**
     * @param settings = { //If null, set to true (If server is instance of LimitlessTCP)
     *     heartbeat: bool,
     *     compression: bool, //Only import the compression library if this is true
     *     chunking: bool //Coming soon
     * }
     */
    constructor(port, settings) {
        this.port = port;

        if (settings === null) {
            this.useHeartbeat = false;
            this.useCompression = false;
            this.useChunking = false;
        }else {
            if (settings.useHeartbeat !== undefined) {
                this.useHeartbeat = settings.useHeartbeat;
            }else {
                this.useHeartbeat = true;
            }

            if (settings.useCompression !== undefined) {
                this.useCompression = settings.useCompression;

                if (settings.useCompression) {  //Load in compression library if enabled
                    this.pako = require('pako');
                }
            }else {
                this.useCompression = true;
                this.pako = require('pako');
            }

            if (settings.useChunking !== undefined) {
                this.useChunking = settings.useChunking;
            }else {
                this.useChunking = true;
            }
        }

        this.connectedSockets = [];
        this.allSockets = [];

        this.server = net.createServer();
    }

    listen(callback) {
        this.server.listen(this.port, cb => {
            if (callback !== null) {
                callback(cb);
            }

            if (this.useHeartbeat) {
                this.startHeartbeat();
            }
        });

        this.server.on('connection', (socket) => {
            socket.id = crypto.randomUUID();

            this.connectedSockets.push(socket);
            this.allSockets.push(socket);

            socket.write(JSON.stringify({ type: 'tcpsjs-connect', data: { useHeartbeat: this.useHeartbeat, useCompression: this.useCompression, useChunking: this.useChunking } }))

            if (this.useHeartbeat) {
                socket.lastHeartbeat = Date.now();
                socket.heartbeatCounter = 0; //Goes up to 8
                socket.heartbeatReceived = true;

                //Listed for heartbeats
                socket.on('data', (dataBuffer) => {
                    let splitPackets = dataBuffer.toString().split('<PacketSplitter>');

                    for (let packet of splitPackets) {
                        if (packet.length !== 0) {
                            try { //Try to parse, if error it isn't a json
                                packet = JSON.parse(packet)

                                switch (packet.type) {
                                    case 'tcpsjs-heartbeat':
                                        socket.lastHeartbeat = Date.now();
                                        socket.heartbeatCounter = 0;
                                        socket.heartbeatReceived = true;
                                        break;
                                }
                            } catch (e) {
                            }
                        }
                    }
                });
            }

            this.server.on('close', () => {
                this.server.close(() => {
                    if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                        clearInterval(this.heartbeatInterval);
                    }
                });
            });

            this.server.on('end', () => {
                this.server.close(() => {
                    if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                        clearInterval(this.heartbeatInterval);
                    }
                });
            });
        });
        return this;
    }

    emit(data, socket) {
        try {
            data = JSON.stringify(data);
        }catch (e) {}

        if (this.useCompression) {
            socket.write(JSON.stringify({ type: 'tcpsjs-packet', data: Buffer.from(pako.deflate(data)) }) + '<PacketSplitter>');
        }else {
            socket.write(JSON.stringify({ type: 'tcpsjs-packet', data: data }) + '<PacketSplitter>');
        }
    }

    on(event, socket, callback) {
        if (socket === null) {
            switch (event.toLowerCase()) {
                case 'connection':
                case 'connect':
                    this.server.on('connection', callback);
                    break;

                case 'error':
                    this.server.on('error', callback);
                    break;

                case 'close':
                    this.server.on('close', callback);
                    break;

                default:
                    console.log("There was an issue listening to the event '" + event + "'");

                    callback(null);
                    break;
            }
        }else {
            switch(event.toLowerCase()) {
                case 'close':
                    socket.on('close', cb => {
                        this.removeSocketFromConnectedSockets(socket);
                        callback(cb);
                    });
                    break;

                case 'data':
                    //This will attempt to split incoming packets then return them each in a callback
                    socket.on('data', (dataBuffer) => {
                        let splitPackets = dataBuffer.toString().split('<PacketSplitter>');

                        for (let packet of splitPackets) {
                            if (packet.length !== 0) {
                                packet = JSON.parse(packet);
                                if (packet.type === 'tcpsjs-packet') {

                                    let packetData;

                                    if (this.useCompression) {
                                        packetData = Buffer.from(pako.inflate(new Uint8Array(Buffer.from(packet.data.data)))).toString();
                                    }else {
                                        packetData = packet.data.toString();
                                    }

                                    try { //Try to parse, if error it isn't a json
                                        packetData = JSON.parse(packetData)
                                    }catch (e) {}

                                    //Returns a packet and a function to reply
                                    callback(packetData);
                                }
                            }
                        }
                    });
                    break;

                case 'drain':
                    socket.on('data', callback);
                    break;

                case 'end':
                    socket.on('end', callback);
                    break;

                case 'error':
                    socket.on('error', callback);
                    break;

                case 'lookup':
                    socket.on('lookup', callback);
                    break;

                default:
                    console.log("There was an issue listening to the event '" + event + "'");

                    callback(null);
                    break;
            }
        }
    }


    startHeartbeat() {

        this.heartbeatInterval = setInterval(() => {
            for (let socket of this.connectedSockets) {
                socket.heartbeatReceived = false;
                socket.write(JSON.stringify({ type: 'tcpsjs-heartbeat' }) + '<PacketSplitter>');

                setTimeout(() => {
                    if (socket.heartbeatReceived) {
                        socket.heartbeatCounter = 0;
                    }else {
                        socket.heartbeatCounter++;

                        if (socket.heartbeatCounter === 8) {
                            socket.emit('error', new TCPServiceError(ErrorType.HEARTBEAT, 'A client has timed out due to heartbeat', socket));
                            this.removeSocketFromConnectedSockets(socket);
                        }
                    }
                }, 900)
            }
        }, 1000)
    }

    removeSocketFromConnectedSockets(socket) {
        this.connectedSockets.forEach((loopSocket, index) => {
            if (loopSocket.id === socket.id) {
                this.connectedSockets.splice(index, 1);
            }
        });
    }
}

module.exports = { TCPClient, TCPServer }


/* ======= Custom Error Stuff ======= */
let ErrorType = {
    UNDEFINED: 'Undefined Error',

    HEARTBEAT: 'Heartbeat Error',
    REDACTED: 'Redacted Error'
}

class TCPServiceError extends Error {
    constructor(type, message, data) {
        switch (type) {
            case ErrorType.HEARTBEAT:
                super("The heartbeat counter has timed out");
                this.name = type;
                break;

            case ErrorType.REDACTED:
                super("Some info you have inputted cannot be used");
                this.name = type;
                break;

            default:
                super("Undefined error type");
                this.name = ErrorType.UNDEFINED;
                break;
        }
        this.Details = message;

        if (data !== undefined) {
            this.Data = data;
        }
        Error.captureStackTrace(this, this.constructor);
    }
}