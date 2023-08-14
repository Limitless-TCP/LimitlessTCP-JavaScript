/**
 * This service is a wrapper for the TCP "Net" module.
 * It provides an easy way to create tcp client and server connections with the ability to create networks with ease.
 *
 * Please refer to the JS docs for more information:
 * https://github.com/Limitless-TCP/LimitlessTCP-JavaScript/blob/master/README.md
 */

const net                                      = require('net');
const crypto                                   = require('crypto');
const { Worker }                               = require('worker_threads');

let chunkSize                                  = 14000;

class TCPClient {

    constructor(address, port) {

        this.isServerAnInstance = false;

        this.useHeartbeat = false;
        this.useCompression = false;
        this.useChunking = false;

        this.worker = null;

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
                                    this.socket.write(JSON.stringify({ type: 'tcpsjs-heartbeat' }) + '<PacketSplitter>');
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

                                    //Runs a worker (thread) to compress, chunk, and send the data in the background
                                    this.worker = new Worker(`
                                            const { parentPort } = require('worker_threads');

                                            let transactions = [];
                                            let invalidPackets = "";
                                            
                                            //Garbage collector
                                            setInterval(() => {
                                                let counter = 0;
                                                for (let transaction of transactions) {
                                                    if (transaction.lastTransaction + 15000 <= Date.now()) {
                                                        transactions.splice(counter, 1);
                                                    }else {
                                                        counter++;
                                                    }
                                                }
                                            }, 5000);
                                            
                                            parentPort.on('message', function(data) {
                                                data = JSON.parse(data);
                                                switch (data.type) {
                                                    case 'write_chunk':
                                                        let packetData;
                                                        if (data.data.useCompression) {
                                                            packetData = Buffer.from(require('pako').deflate(data.data.packetData));
                                                        }else {
                                                            packetData = Buffer.from(data.data.packetData);
                                                        }
                                            
                                            
                                                        packetData = splitBuffer(packetData, data.data.chunkSize);
                                                        let transactionId = require('crypto').randomUUID();
                                            
                                                        let chunkIndex = 0;
                                                        let packetInterval = setInterval(() => {
                                            
                                                            if (chunkIndex === packetData.length - 1) {
                                                                parentPort.postMessage({ type: 'write_chunk', data: JSON.stringify({ type: 'tcpsjs-chunk', transactionId: transactionId, chunkNum: chunkIndex, chunkAmount: packetData.length, last: true, data: packetData[chunkIndex] }) + '<PacketSplitter>'});
                                                                clearInterval(packetInterval);
                                                            }else {
                                                                parentPort.postMessage({ type: 'write_chunk', data: JSON.stringify({ type: 'tcpsjs-chunk', transactionId: transactionId, chunkNum: chunkIndex, chunkAmount: packetData.length, last: false, data: packetData[chunkIndex] }) + '<PacketSplitter>'});
                                                                chunkIndex++;
                                                            }
                                                        }, 1);
                                                        break;
                                            
                                            
                                                    case 'parse_data':
                                                        let parsedData = parseData(data.data.data);
                                            
                                                        for (let packet of parsedData.parsedPackets) {
                                            
                                                            let packetData;
                                                            switch(packet.type) {
                                                                case 'tcpsjs-packet':
                                                                    if (data.data.useCompression) {
                                                                        packetData = Buffer.from(require('pako').inflate(new Uint8Array(Buffer.from(packet.data.data)))).toString();
                                                                    }else {
                                                                        packetData = packet.data.toString();
                                                                    }
                                            
                                                                    try { //Try to parse, if error it isn't a json
                                                                        packetData = JSON.parse(packetData)
                                                                    }catch (e) {}
                                            
                                                                    //Send a message to emit the data event
                                                                    parentPort.postMessage({ type: 'emit_data', data: packetData });
                                                                    break;
                                            
                                                                case 'tcpsjs-chunk':
                                                                    let transaction;
                                            
                                                                    //If transaction exists, fetch it, if not, create a new one
                                                                    if (transactions.some(item => item.id === packet.transactionId)) {
                                                                        transaction = transactions[transactions.findIndex(item => item.id === packet.transactionId)];
                                                                    }else {
                                                                        transaction = {
                                                                            id: packet.transactionId,
                                                                            chunks: [],
                                                                            lastTransaction: Date.now()
                                                                        }
                                                                        transactions.push(transaction);
                                                                    }
                                            
                                                                    transaction.chunks.push(Buffer.from(packet.data.data));
                                                                    
                                                                    console.log(packet.chunkNum + " - " + packet.chunkAmount);
                                            
                                                                    if (packet.last) {
                                                                        if (data.data.useCompression) {
                                                                            packetData = Buffer.from(require('pako').inflate(new Uint8Array(Buffer.concat(transaction.chunks)))).toString();
                                                                        }else {
                                                                            packetData = Buffer.concat(transaction.chunks).toString();
                                                                        }
                                                                        
                                                                        let counter = 0;
                                                                        for (let item of transactions) {
                                                                            if (item.id === transaction.transactionId) {
                                                                                transactions.splice(counter, 1);
                                                                            }else {
                                                                                counter++;
                                                                            }
                                                                        }
                                            
                                                                        try {
                                                                            packetData = JSON.parse(packetData);
                                                                        }catch (e) {}
                                            
                                                                        parentPort.postMessage({ type: 'emit_data', data: packetData });
                                                                    }
                                                                    break;
                                                            }
                                                        }
                                                        break;
                                                }
                                            
                                            });
                                            
                                            function splitBuffer(buffer, chunkSize) {
                                                const chunks = [];
                                                let offset = 0;
                                            
                                                while (offset < buffer.length) {
                                                    const chunk = buffer.slice(offset, offset + chunkSize);
                                                    chunks.push(chunk);
                                                    offset += chunkSize;
                                                }
                                            
                                                return chunks;
                                            }
                                            
                                            function parseData(data) {
                                                let parsedPackets = [];
                                                let splitPackets = data.split('<PacketSplitter>');
                                            
                                                for (let packet of splitPackets) {
                                                    if (packet.length !== 0) {
                                                        try {
                                                            packet = JSON.parse(packet);
                                            
                                                            parsedPackets.push(packet);
                                            
                                                        }catch (e) {
                                                            try {
                                                                if (packet.endsWith('}')) {
                                                                    invalidPackets += (packet + '<PacketSplitter>');
                                                                }else {
                                                                    invalidPackets += packet;
                                                                }
                                                            }catch (err) {
                                                            }
                                            
                                                            let unstackedPackets = invalidPackets.split('<PacketSplitter>');
                                            
                                                            let index = 0;
                                                            for (let unstackedPacket of unstackedPackets) {
                                                                if (unstackedPacket.length !== 0) {
                                                                    try {
                                                                        unstackedPacket = JSON.parse(unstackedPacket);
                                            
                                                                        parsedPackets.push(unstackedPacket);
                                            
                                                                        unstackedPackets.splice(index, 1);
                                                                    }catch (e) {
                                                                        index++;
                                                                    }
                                                                }
                                                            }
                                            
                                                            invalidPackets = "";
                                                            unstackedPackets.forEach((unstackedPacket) => {
                                                                invalidPackets += unstackedPacket;
                                                            });
                                                        }
                                            
                                            
                                                    }
                                                }
                                            
                                                return { parsedPackets: parsedPackets, invalidPackets: invalidPackets };
                                            }
                                            `, {eval: true});

                                    this.worker.on('message', (msg) => {
                                        switch (msg.type) {
                                            case 'write_chunk':
                                                this.socket.write(msg.data);
                                                break;

                                            case 'emit_data':
                                                this.socket.emit("data", Buffer.from(JSON.stringify({ type: 'tcpsjs-data', data: msg.data })));
                                                break;
                                        }
                                    });
                                    break;
                            }
                        } catch (e) {}
                    }
                }
            });

            this.socket.on('close', () => {
                this.worker.terminate();
                this.socket.destroy();
                if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                    clearInterval(this.heartbeatInterval);
                }
            });

            this.socket.on('end', () => {
                this.socket.destroy();
                this.worker.terminate();
                if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                    clearInterval(this.heartbeatInterval);
                }
            });
        });

        return this;
    }

    write(data) { this.emit(data); }
    emit(data) {
        try { //If err, it isnt a json
            data = JSON.stringify(data);
        }catch (e) {
            try { //Try to stringify it anyways
                data = data.toString();
            }catch (e) {}
        }

        if (this.isServerAnInstance) {
            if (this.useChunking && data.length >= chunkSize) { //If it is less than chunksize, it can be sent in one packet
                this.worker.postMessage(JSON.stringify({type: 'write_chunk', data: {packetData: data, chunkSize: chunkSize, useCompression: this.useCompression} }));

            }else { //This is sent in one packet
                if (this.useCompression) {
                    this.socket.write(JSON.stringify({ type: 'tcpsjs-packet', data: Buffer.from(pako.deflate(data)) }) + '<PacketSplitter>');
                }else {
                    this.socket.write(JSON.stringify({ type: 'tcpsjs-packet', data: data }) + '<PacketSplitter>');
                }
            }


        }else {
            this.socket.write(data);
        }
    }

    on(event, callback) {
        switch(event.toLowerCase()) {
            case 'close':
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
                        try {
                            let packet = JSON.parse(dataBuffer.toString());
                            if (packet.type === 'tcpsjs-data') {
                                let packetData = packet.data;
                                try {
                                    JSON.parse(packetData);
                                }catch (e) {}

                                callback(packetData)
                            }
                        }catch (e) {
                            this.worker.postMessage(JSON.stringify({
                                type: 'parse_data',
                                data: {
                                    data: dataBuffer.toString(),
                                    useCompression: this.useCompression
                                }
                            }));
                        }
                    }else {
                        let packet = dataBuffer.toString()

                        try {
                            packet = JSON.parse(dataBuffer);
                        }catch (e) {}

                        callback(packet);
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
                this.worker.terminate();
                this.socket.destroy();
                clearInterval(this.heartbeatInterval);
            }
        }, 1000)
    }
}


/**
 *
 * @constructor(port, settings)
 * - This is called to initialize the server
 */
class TCPServer {

    /**
     * @param settings = { //If null, set to true (If server is instance of LimitlessTCP)
     *     heartbeat: bool,
     *     compression: bool, //Only import the compression library if this is true
     *     chunking: bool //Coming soon
     * }
     */
    constructor(port, settings) {

        this.chunks = []; //temp
        this.invalidPackets = ""; //temp
        this.chunkNums = []; //temp

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

    //This is called when the user is ready to listen for connections
    listen(callback) {
        this.server.listen(this.port, cb => {
            if (callback !== null) {
                callback(cb);
            }

            if (this.useHeartbeat) {
                this.startHeartbeat();
            }

            //Runs a worker (thread) to compress, chunk, and send the data in the background
            this.worker = new Worker(`
                            const { parentPort } = require('worker_threads');
                            
                            
                            /**
                             * socket = {
                             *     id: id,
                             *     transactions: [],
                             *     invalidPackets: '',
                             *     lastTransaction: null
                             * }
                             */
                            let sockets = [];
                            
                            //Garbage collector
                            setInterval(() => {
                                let socketCounter = 0;
                                for (let socket of sockets) {
                                    if (socket.lastTransaction + 15000 <= Date.now()) {
                                        sockets.splice(socketCounter, 1);
                                    }else {
                                        socketCounter++;
                                        let transactionCounter = 0;
                                        for (let transaction of socket.transactions) {
                                            if (transaction.lastTransaction + 15000 <= Date.now()) {
                                                socket.transactions.splice(transactionCounter, 1);
                                            }else {
                                                transactionCounter++;
                                            }
                                        }
                                    }
                                }
                            }, 5000);
                            
                            parentPort.on('message', function(data) {
                                data = JSON.parse(data);
                                switch (data.type) {
                                    case 'write_chunk':
                                        let packetData;
                                        if (data.data.useCompression) {
                                            packetData = Buffer.from(require('pako').deflate(data.data.packetData));
                                        }else {
                                            packetData = Buffer.from(data.data.packetData);
                                        }
                            
                            
                                        packetData = splitBuffer(packetData, data.data.chunkSize);
                                        let transactionId = require('crypto').randomUUID();
                            
                                        let chunkIndex = 0;
                                        let packetInterval = setInterval(() => {
                            
                                            if (chunkIndex === packetData.length - 1) {
                                                parentPort.postMessage({ type: 'write_chunk', socketId: data.socketId, data: JSON.stringify({ type: 'tcpsjs-chunk', transactionId: transactionId, chunkNum: chunkIndex, chunkAmount: packetData.length, last: true, data: packetData[chunkIndex] }) + '<PacketSplitter>'});
                                                clearInterval(packetInterval);
                                            }else {
                                                parentPort.postMessage({ type: 'write_chunk', socketId: data.socketId, data: JSON.stringify({ type: 'tcpsjs-chunk', transactionId: transactionId, chunkNum: chunkIndex, chunkAmount: packetData.length, last: false, data: packetData[chunkIndex] }) + '<PacketSplitter>'});
                                                chunkIndex++;
                                            }
                                        }, 1);
                                        break;
                            
                            
                                    case 'parse_data':
                                        let socket = getSocketById(data.data.socketId);;
                                        let parsedData = parseData(socket, data.data.data);
                            
                                        for (let packet of parsedData.parsedPackets) {
                                        
                                            let packetData;
                                            switch(packet.type) {
                                                case 'tcpsjs-packet':
                                                    if (data.data.useCompression) {
                                                        packetData = Buffer.from(require('pako').inflate(new Uint8Array(Buffer.from(packet.data.data)))).toString();
                                                    }else {
                                                        packetData = packet.data.toString();
                                                    }
                            
                                                    try { //Try to parse, if error it isn't a json
                                                        packetData = JSON.parse(packetData)
                                                    }catch (e) {}
                            
                                                    //Send a message to emit the data event
                                                    parentPort.postMessage({ type: 'emit_data', socketId: socket.id, data: packetData });
                                                    break;
                            
                                                case 'tcpsjs-chunk':
                                                    let transaction = getTransactionById(socket, packet.transactionId)
                            
                                                    transaction.chunks.push(Buffer.from(packet.data.data));
                                                    
                                                    console.log(packet.chunkNum + " - " + packet.chunkAmount);
                                                                                           
                                                    if (packet.last) {
                                                        if (data.data.useCompression) {
                                                            packetData = Buffer.from(require('pako').inflate(new Uint8Array(Buffer.concat(transaction.chunks)))).toString();
                                                        }else {
                                                            packetData = Buffer.concat(transaction.chunks).toString();
                                                        }
                            
                                                        let counter = 0;
                                                        for (let item of socket.transactions) {
                                                            if (item.id === transaction.transactionId) {
                                                                socket.transactions.splice(counter, 1);
                                                            }else {
                                                                counter++;
                                                            }
                                                        }
                            
                                                        try {
                                                            packetData = JSON.parse(packetData);
                                                        }catch (e) {}
                            
                                                        parentPort.postMessage({ type: 'emit_data', socketId: socket.id, data: packetData });
                                                    }
                                                    break;
                                            }
                                        }
                                        break;
                                }
                            
                            });
                            
                            function getTransactionById(socket, transactionId) {
                                let transaction = null;
                                
                                if (socket.transactions.some(item => item.id === transactionId)) {
                                    transaction = socket.transactions[socket.transactions.findIndex(item => item.id === transactionId)];
                                }else {
                                    transaction = {
                                        id: transactionId,
                                        chunks: [],
                                        lastTransaction: Date.now()
                                    }
                                    socket.transactions.push(transaction);
                                }
                            
                                return transaction;
                            }
                            
                            function getSocketById(socketId) {
                                let socket = null;
                                
                                if (sockets.some(item => item.id = socketId)) {
                                    socket = sockets[sockets.findIndex(item => item.id = socketId)];
                                    
                                }else {
                                    socket = {
                                        id: socketId,
                                        transactions: [],
                                        invalidPackets: "",
                                        lastTransaction: Date.now()
                                    }
                                    
                                    sockets.push(socket);
                                }
                            
                                return socket;
                            }
                            
                            function splitBuffer(buffer, chunkSize) {
                                const chunks = [];
                                let offset = 0;
                            
                                while (offset < buffer.length) {
                                    const chunk = buffer.slice(offset, offset + chunkSize);
                                    chunks.push(chunk);
                                    offset += chunkSize;
                                }
                            
                                return chunks;
                            }
                            
                            function parseData(socket, data) {
                                let parsedPackets = [];
                                let splitPackets = data.split('<PacketSplitter>');
                            
                                for (let packet of splitPackets) {
                                    if (packet.length !== 0) {
                                        try {
                                            packet = JSON.parse(packet);
                            
                                            parsedPackets.push(packet);
                            
                                        }catch (e) {
                                            try {
                                                if (packet.endsWith('}')) {
                                                    socket.invalidPackets += (packet + '<PacketSplitter>');
                                                }else {
                                                    socket.invalidPackets += packet;
                                                }
                                            }catch (err) {
                                            }
                            
                                            let unstackedPackets = socket.invalidPackets.split('<PacketSplitter>');
                            
                                            let index = 0;
                                            for (let unstackedPacket of unstackedPackets) {
                                                if (unstackedPacket.length !== 0) {
                                                    try {
                                                        unstackedPacket = JSON.parse(unstackedPacket);
                            
                                                        parsedPackets.push(unstackedPacket);
                            
                                                        unstackedPackets.splice(index, 1);
                                                    }catch (e) {
                                                        index++;
                                                    }
                                                }
                                            }
                            
                                            socket.invalidPackets = "";
                                            unstackedPackets.forEach((unstackedPacket) => {
                                                socket.invalidPackets += unstackedPacket;
                                            });
                                        }
                            
                            
                                    }
                                }
                            
                                return { parsedPackets: parsedPackets, invalidPackets: socket.invalidPackets };
                            }
                                            `, {eval: true});

            this.worker.on('message', (msg) => {

                let socket = this.connectedSockets[this.connectedSockets.findIndex(item => item.id === msg.socketId)];
                switch (msg.type) {
                    case 'write_chunk':
                        socket.tcpSocket.write(msg.data);
                        break;

                    case 'emit_data':
                        socket.tcpSocket.emit("data", Buffer.from(JSON.stringify({ type: 'tcpsjs-data', data: msg.data })));
                        break;
                }
            });
        });

        this.server.on('connection', (socket) => {

            socket = new Socket(this, socket);

            this.connectedSockets.push(socket);
            this.allSockets.push(socket);

            socket.tcpSocket.write(JSON.stringify({ type: 'tcpsjs-connect', data: { useHeartbeat: this.useHeartbeat, useCompression: this.useCompression, useChunking: this.useChunking } })  + '<PacketSplitter>')

            if (this.useHeartbeat) {
                socket.lastHeartbeat = Date.now();
                socket.heartbeatCounter = 0; //Goes up to 8
                socket.heartbeatReceived = true;

                //Listed for heartbeats
                socket.tcpSocket.on('data', (dataBuffer) => {
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
                this.worker.terminate();
                this.server.close(() => {
                    if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                        clearInterval(this.heartbeatInterval);
                    }
                });
            });

            this.server.on('end', () => {
                this.worker.terminate();
                this.server.close(() => {
                    if (this.heartbeatInterval !== null && this.heartbeatInterval !== undefined) {
                        clearInterval(this.heartbeatInterval);
                    }
                });
            });
        });
        return this;
    }

    on(event, callback) {
        switch (event.toLowerCase()) {
            case 'connection':
            case 'connect':
                this.server.on('connection', (socket) => {
                    setTimeout(() => {
                        for (let sock of this.connectedSockets) {
                            if (sock.tcpSocket.id === socket.id) {
                                callback(sock);
                            }
                        }
                    }, 10);
                });
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
    }


    startHeartbeat() {

        this.heartbeatInterval = setInterval(() => {
            for (let socket of this.connectedSockets) {
                socket.heartbeatReceived = false;
                socket.tcpSocket.write(JSON.stringify({ type: 'tcpsjs-heartbeat' }) + '<PacketSplitter>');

                setTimeout(() => {
                    if (socket.heartbeatReceived) {
                        socket.heartbeatCounter = 0;
                    }else {
                        socket.heartbeatCounter++;

                        if (socket.heartbeatCounter === 8) {
                            socket.tcpSocket.emit('error', new TCPServiceError(ErrorType.HEARTBEAT, 'A client has timed out due to heartbeat', socket));
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

/**
 * This class is used by the server for each socket instance
 *
 * @constructor(serverInstance, socketInstance)
 *  - This is called when a socket connects to a server instance
 */
class Socket {

    constructor(serverInstance, socketInstance) {
        this.tcpServer = serverInstance;
        this.tcpSocket = socketInstance;

        this.id = crypto.randomUUID();

        this.tcpSocket.id = crypto.randomUUID();
    }


    on(event, callback) {
        switch(event.toLowerCase()) {
            case 'close':
                this.tcpSocket.on('close', cb => {
                    this.tcpServer.removeSocketFromConnectedSockets(this);
                    callback(cb);
                });
                break;

            case 'data':
                //This will attempt to split incoming packets then return them each in a callback
                this.tcpSocket.on('data', (dataBuffer) => {
                    try {
                        let packet = JSON.parse(dataBuffer.toString());
                        if (packet.type === 'tcpsjs-data') {
                            let packetData = packet.data;
                            try {
                                JSON.parse(packetData);
                            }catch (e) {}

                            callback(packetData)
                        }
                    }catch (e) {
                        this.tcpServer.worker.postMessage(JSON.stringify({
                            type: 'parse_data',
                            data: {
                                socketId: this.id,
                                data: dataBuffer.toString(),
                                useCompression: this.tcpServer.useCompression
                            }
                        }));
                    }
                });
                break;

            case 'drain':
                this.tcpSocket.on('data', callback);
                break;

            case 'end':
                this.tcpSocket.on('end', callback);
                break;

            case 'error':
                this.tcpSocket.on('error', callback);
                break;

            case 'lookup':
                this.tcpSocket.on('lookup', callback);
                break;

            default:
                console.log("There was an issue listening to the event '" + event + "'");

                callback(null);
                break;
        }
    }

    write(data) {
        this.emit(data);
    }
    emit(data) {
        try { //If err, it isnt a json
            data = JSON.stringify(data);
        }catch (e) {
            try { //Try to stringify it anyways
                data = data.toString();
            }catch (e) {}
        }

        if (this.tcpServer.useChunking && data.length >= chunkSize) { //If it is less than chunksize, it can be sent in one packet
            this.tcpServer.worker.postMessage(JSON.stringify({type: 'write_chunk', socketId: socket.id, data: {packetData: data, chunkSize: chunkSize, useCompression: this.useCompression} }));

        }else { //This is sent in one packet
            if (this.tcpServer.useCompression) {
                this.tcpSocket.write(JSON.stringify({ type: 'tcpsjs-packet', data: Buffer.from(pako.deflate(data)) }) + '<PacketSplitter>');
            }else {
                this.tcpSocket.write(JSON.stringify({ type: 'tcpsjs-packet', data: data }) + '<PacketSplitter>');
            }
        }
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