const sleep = (msec: number) => new Promise((resolve) => setTimeout(resolve, msec));


const createMagicPacket = (mac: string) => {
    const mac_bytes = 6;
    const mac_buffer = new Uint8Array(mac_bytes);
    if (mac.length == 2 * mac_bytes + (mac_bytes - 1)) {
        mac = mac.replace(new RegExp(mac[2], 'g'), '');
    }
    if (mac.length != 2 * mac_bytes || mac.match(/[^a-fA-F0-9]/)) {
        throw new Error("malformed MAC address '" + mac + "'");
    }
    for (let i = 0; i < mac_bytes; i++) {
        mac_buffer[i] = parseInt(mac.substr(2 * i, 2), 16);
    }
    let num_macs = 16;
    const buffer = new Uint8Array((1 + num_macs) * mac_bytes);
    for (let i = 0; i < mac_bytes; i++) {
        buffer[i] = 0xff;
    }
    for (let i = 0; i < num_macs; i++) {
        const copy = (src: Uint8Array, target: Uint8Array, targetStart: number, sourceStart: number, sourceEnd: number) => {
            for (let i = 0; i < sourceEnd; i++) {
                target[targetStart + i] = src[sourceStart + i];
            }
        };
        //mac_buffer.copy(buffer, (i + 1) * mac_bytes, 0, mac_buffer.length)
        copy(mac_buffer, buffer, (i + 1) * mac_bytes, 0, mac_buffer.length);
    }
    return buffer;
};

const wakeOnLAN = async (mac: string, opts: { address?: string, num_packets?: number, interval?: number, port?: number } = {}) => {
    opts = opts || {};
    const address = opts['address'] || '255.255.255.255';
    const num_packets = opts['num_packets'] || 3;
    const interval = opts['interval'] || 100;
    const port = opts['port'] || 9;
    const magic_packet = createMagicPacket(mac);
    const socket = Deno.listenDatagram({ hostname: "0.0.0.0", port, transport: "udp" }); // broadcast, not supported yet https://github.com/denoland/deno/issues/10470
    const peerAddr: Deno.Addr = { transport: "udp", hostname: address, port };

    for (let i = 0; i < num_packets; i++) {
        socket.send(magic_packet, peerAddr);
        await sleep(interval);
    }
};

export { wakeOnLAN, createMagicPacket };