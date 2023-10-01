import { Platform } from '../lib/connection';
import { ComponentType, PropertyDataType } from '../lib/type';
import express from 'express';
import * as fs from 'fs';
import { join } from 'path';
import cors from 'cors';

const app = express();

async function main() {
    const plat = new Platform('BOT-13JK123', 'martas', 'Zvonek');
    const nodeLight = plat.addNode('bell', 'Zvonek', ComponentType.generic);
    nodeLight.addProperty({
        propertyId: 'stream',
        dataType: PropertyDataType.string,
        name: 'Stream',
        format: 'httpStream',
    });

    nodeLight.addProperty({
        propertyId: 'movement',
        dataType: PropertyDataType.boolean,
        name: 'Pohyb',
    });

    plat.init();

    console.log('sending data');

    plat.publishData('bell', 'stream', 'http://192.168.10.164:9191/stream');
    plat.publishData('bell', 'movement', 'false');


    app.listen(9191, function () {
        console.log('Listening  http://localhost:9191/stream');
    });
}

const videoPath = join(__dirname, '../assets/alfasilver-20s.mp4');

app.use(cors());
app.get('/stream', function (req, res) {
    // Ensure there is a range given for the video
    const range = req.headers.range;

    // get video stats (about 61MB)

    const videoSize = fs.statSync(videoPath).size;

    // Parse Range
    // Example: "bytes=32324-"
    const CHUNK_SIZE = 10 ** 6; // 1MB
    const start = Number(range ? range!.replace(/\D/g, '') : 0);
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

    // Create headers
    const contentLength = end - start + 1;
    const headers = {
        'Content-Range': `bytes ${start}-${end}/${videoSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength,
        'Content-Type': 'video/mp4',
    };

    // HTTP Status 206 for Partial Content
    res.writeHead(206, headers);

    // create video read stream for this particular chunk
    const videoStream = fs.createReadStream(videoPath, { start, end });

    // Stream the video chunk to the client
    videoStream.pipe(res);
});

app.head('/stream', function (req, res) {
    // Ensure there is a range given for the video
    const range = req.headers.range;

    // get video stats (about 61MB)

    const videoSize = fs.statSync(videoPath).size;

    const headers = {
        'Content-Length': videoSize,
        'Content-Type': 'video/mp4',
    };

    // HTTP Status 206 for Partial Content
    res.writeHead(206, headers);
});

main();
