const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');
const morgan = require('morgan');
const AWS = require('aws-sdk');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const videoApi = require('./videosdk');
const agoraSdk = require('./agorasdk');
const imageApi = require('./imageApi');
const admin = require('firebase-admin');
const { loadModel, semanticSearch } = require('./semanticSearch');

admin.initializeApp({
    credential: admin.credential.cert(require('./crewdog-17734-firebase-sdk-admin.json'))
});

const db = admin.firestore();

loadModel();

dotenv.config();

const app = express();
const upload = multer({ dest: 'temp_uploads/' });
const port = 3000;

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const requestTimeout = 360000;
app.use((req, res, next) => {
    req.setTimeout(requestTimeout, () => {
        const error = new Error('Request Timeout');
        error.status = 408;
        next(error);
    });
    next();
});

async function getVideoHeight(filePath) {
    try {
        const { stdout } = await exec(`ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=height -of csv=p=0 "${filePath}"`);
        return parseInt(stdout.trim());
    } catch (error) {
        console.error('Error executing ffprobe:', error);
        throw new Error('Failed to get video dimensions');
    }
}

async function scaleWatermark(watermarkImagePath, watermarkScaledPath, watermarkScale) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = 'ffmpeg';
        const ffmpegScaleProcess = spawn(ffmpegPath, [
            '-i', watermarkImagePath,
            '-vf', `scale=-1:${watermarkScale}`,
            watermarkScaledPath,
        ]);

        let ffmpegOutput = '';
        ffmpegScaleProcess.stderr.on('data', (data) => {
            ffmpegOutput += data.toString();
        });

        ffmpegScaleProcess.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.error('FFmpeg output:', ffmpegOutput);
                reject(new Error(`Failed to scale the watermark image. FFmpeg process exited with code: ${code}`));
            }
        });
    });
}

async function addWatermarkToVideo(inputPath, watermarkPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = 'ffmpeg';
        const ffmpegProcess = spawn(ffmpegPath, [
            '-i', inputPath,
            '-i', watermarkPath,
            '-filter_complex', `[0:v][1:v]overlay=W-w-10:10:enable='between(t,0,1000000)'`,
            '-b:v', '500k',
            '-codec:a', 'copy',
            outputPath,
        ]);

        let ffmpegOutput = '';
        ffmpegProcess.stderr.on('data', (data) => {
            ffmpegOutput += data.toString();
        });

        ffmpegProcess.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.error('FFmpeg output:', ffmpegOutput);
                reject(new Error(`Failed to add watermark to video. FFmpeg process exited with code: ${code}`));
            }
        });
    });
}

async function uploadToS3(filePath, fileName) {
    const fileContent = await fs.readFile(filePath);
    const params = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: fileContent
    };

    try {
        const data = await s3.upload(params).promise();
        return data.Location;
    } catch (err) {
        console.error("Error uploading to S3:", err);
        throw err;
    }
}

async function processVideo(req, res, watermarkType) {
    if (!req.file) {
        return res.status(400).send('No file provided');
    }

    const uniqueId = uuidv4();
    const uploadedFilePath = req.file.path;
    const watermarkImagePath = path.join(__dirname, `${watermarkType}-watermark.png`);
    const watermarkScaledPath = path.join(__dirname, `temp_watermarks/watermark_scaled_${uniqueId}.png`);
    const watermarkedFilePath = path.join(__dirname, `temp_watermarked/${uniqueId}_watermarked_${watermarkType}.mp4`);

    try {
        await fs.access(watermarkImagePath);

        const videoHeight = await getVideoHeight(uploadedFilePath);
        const watermarkScale = Math.floor(videoHeight * 0.1);

        await fs.mkdir(path.dirname(watermarkScaledPath), { recursive: true });
        await fs.mkdir(path.dirname(watermarkedFilePath), { recursive: true });

        await scaleWatermark(watermarkImagePath, watermarkScaledPath, watermarkScale);
        await addWatermarkToVideo(uploadedFilePath, watermarkScaledPath, watermarkedFilePath);

        const s3Url = await uploadToS3(watermarkedFilePath, `${uniqueId}_watermarked_${watermarkType}.mp4`);

        res.json({ url: s3Url });

    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send(`Failed to process video: ${error.message}`);
    } finally {
        try {
            await fs.unlink(uploadedFilePath);
            await fs.unlink(watermarkScaledPath);
            await fs.unlink(watermarkedFilePath);
        } catch (error) {
            console.error('Error cleaning up temporary files:', error);
        }
    }
}

app.post('/add_watermark', upload.single('file'), (req, res) => {
    processVideo(req, res, 'default');
});

app.post('/add_watermark_crewdog', upload.single('file'), (req, res) => {
    processVideo(req, res, 'crewdog');
});

app.use('/videosdk', videoApi);
app.use('/agorasdk', agoraSdk);
app.use('/imageapi', imageApi);

app.post('/semantic-search', async (req, res) => {
    try {
        const query = req.body.query;
        const results = await semanticSearch(query, db);
        res.json(results);
    } catch (error) {
        console.error('Error during semantic search:', error);
        res.status(500).json({ error: error.message });
    }
});
app.listen(port, () => {
    console.log(`API listening at http://localhost:${port}`);
});

