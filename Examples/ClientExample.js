let { TCPClient } = require('../Limitless-TCP');

let tcpClient = new TCPClient('127.0.0.1', 1234);

tcpClient.connect(() => {});

let str = "";


// for (let i = 0; i < 10000000; i++) {
//     str += rand_str_without_O0();
// }
// console.log(str.length);

tcpClient.on('connect', () => {
    tcpClient.write({ test: str })

    // for (let i = 0; i < 1000; i++) {
    //     tcpClient.write('test')
    // }

    // tcpClient.write({ test: str });

    tcpClient.on('data', (data) => {
        console.log(data);
    });
});

tcpClient.on('error', (err) => {
    console.log(err)
    //Handle error, heartbeat errors are formatted differently
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