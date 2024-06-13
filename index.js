const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const morgan = require('morgan');
const videoApi = require('./videosdk');
const agoraSdk = require('./agorasdk');

const app = express();
const upload = multer({ dest: 'temp_videos/' });
const port = 3000;

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(express.static('watermarked_videos'));

// Middleware to handle request timeout
const requestTimeout = 360000; // 6 minutes in milliseconds
app.use((req, res, next) => {
    req.setTimeout(requestTimeout, () => {
        const error = new Error('Request Timeout');
        error.status = 408; // Request Timeout
        next(error);
    });
    next();
});

// Existing /add_watermark route
app.post('/add_watermark', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file provided');
    }

    const uploadedFilePath = req.file.path;
    const watermarkImagePath = 'watermark.png';
    const watermarkScaledPath = 'watermark_scaled.png';
    const watermarkedFilePath = `watermarked_videos/${req.file.originalname.replace(/\.[^/.]+$/, '')}_watermarked.mp4`;

    // Delete the old watermarked video if it exists
    fs.unlink(watermarkedFilePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Error deleting old watermarked video:', err);
        }

        // Scale the watermark image to 50% of the video height
        const ffprobePath = 'ffprobe'; // Path to the ffprobe executable
        const ffprobeProcess = spawn(ffprobePath, [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=height',
            '-of',
            'csv=s=x:p=0',
            uploadedFilePath,
        ]);

        ffprobeProcess.stdout.on('data', (data) => {
            const videoHeight = parseInt(data.toString().trim());

            const watermarkScale = Math.floor(videoHeight * 0.1); // Adjust the scale factor as desired

            const ffmpegPath = 'ffmpeg'; // Path to the ffmpeg executable
            const ffmpegScaleProcess = spawn(ffmpegPath, [
                '-i', watermarkImagePath,
                '-vf', `scale=-1:${watermarkScale}`,
                watermarkScaledPath,
            ]);

            ffmpegScaleProcess.on('exit', (code) => {
                if (code === 0) {
                    // Continue with the watermarking process
                    const ffmpegProcess = spawn(ffmpegPath, [
                        '-i', uploadedFilePath,
                        '-i', watermarkScaledPath,
                        '-filter_complex', `[0:v][1:v]overlay=W-w-10:10:enable='between(t,0,1000000)'`,
                        '-b:v', '500k',
                        '-codec:a', 'copy',
                        watermarkedFilePath,
                    ]);

                    ffmpegProcess.on('exit', (code) => {
                        if (code === 0) {
                            res.download(watermarkedFilePath, (err) => {
                                if (err) {
                                    console.error('Error sending watermarked video:', err);
                                }

                                // Delete the uploaded file
                                fs.unlink(uploadedFilePath, (err) => {
                                    if (err) {
                                        console.error('Error deleting uploaded file:', err);
                                    }
                                });

                                // Delete the old watermarked video if it exists
                                fs.unlink(watermarkedFilePath, (err) => {
                                    if (err && err.code !== 'ENOENT') {
                                        console.error('Error deleting old watermarked video:', err);
                                    }
                                });
                            });
                        } else {
                            console.error('Failed to add watermark to video. ffmpeg process exited with code:', code);
                            res.status(500).send('Failed to add watermark to video. Please try again.');
                        }

                        // Delete the scaled watermark image
                        fs.unlink(watermarkScaledPath, (err) => {
                            if (err) {
                                console.error('Error deleting scaled watermark image:', err);
                            }
                        });
                    });
                } else {
                    console.error('Failed to scale the watermark image. ffmpeg process exited with code:', code);
                    res.status(500).send('Failed to add watermark to video. Please try again.');
                }
            });
        });

        ffprobeProcess.on('exit', (code) => {
            if (code !== 0) {
                console.error('Failed to get video dimensions. ffprobe process exited with code:', code);
                res.status(500).send('Failed to add watermark to video. Please try again.');
            }
        });
    });
});

// Existing /add_watermark_crewdog route
app.post('/add_watermark_crewdog', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file provided');
    }

    const uploadedFilePath = req.file.path;
    const watermarkImagePath = 'crewdog-watermark.png';
    const watermarkScaledPath = 'watermark_scaled.png';
    const watermarkedFilePath = `watermarked_videos/${req.file.originalname.replace(/\.[^/.]+$/, '')}_watermarked.mp4`;

    // Delete the old watermarked video if it exists
    fs.unlink(watermarkedFilePath, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.error('Error deleting old watermarked video:', err);
        }

        // Scale the watermark image to 50% of the video height
        const ffprobePath = 'ffprobe'; // Path to the ffprobe executable
        const ffprobeProcess = spawn(ffprobePath, [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=height',
            '-of',
            'csv=s=x:p=0',
            uploadedFilePath,
        ]);

        ffprobeProcess.stdout.on('data', (data) => {
            const videoHeight = parseInt(data.toString().trim());

            const watermarkScale = Math.floor(videoHeight * 0.1); // Adjust the scale factor as desired

            const ffmpegPath = 'ffmpeg'; // Path to the ffmpeg executable
            const ffmpegScaleProcess = spawn(ffmpegPath, [
                '-i', watermarkImagePath,
                '-vf', `scale=-1:${watermarkScale}`,
                watermarkScaledPath,
            ]);

            ffmpegScaleProcess.on('exit', (code) => {
                if (code === 0) {
                    // Continue with the watermarking process
                    const ffmpegProcess = spawn(ffmpegPath, [
                        '-i', uploadedFilePath,
                        '-i', watermarkScaledPath,
                        '-filter_complex', `[0:v][1:v]overlay=W-w-10:10:enable='between(t,0,1000000)'`,
                        '-b:v', '500k',
                        '-codec:a', 'copy',
                        watermarkedFilePath,
                    ]);

                    ffmpegProcess.on('exit', (code) => {
                        if (code === 0) {
                            res.download(watermarkedFilePath, (err) => {
                                if (err) {
                                    console.error('Error sending watermarked video:', err);
                                }

                                // Delete the uploaded file
                                fs.unlink(uploadedFilePath, (err) => {
                                    if (err) {
                                        console.error('Error deleting uploaded file:', err);
                                    }
                                });

                                // Delete the old watermarked video if it exists
                                fs.unlink(watermarkedFilePath, (err) => {
                                    if (err && err.code !== 'ENOENT') {
                                        console.error('Error deleting old watermarked video:', err);
                                    }
                                });
                            });
                        } else {
                            console.error('Failed to add watermark to video. ffmpeg process exited with code:', code);
                            res.status(500).send('Failed to add watermark to video. Please try again.');
                        }

                        // Delete the scaled watermark image
                        fs.unlink(watermarkScaledPath, (err) => {
                            if (err) {
                                console.error('Error deleting scaled watermark image:', err);
                            }
                        });
                    });
                } else {
                    console.error('Failed to scale the watermark image. ffmpeg process exited with code:', code);
                    res.status(500).send('Failed to add watermark to video. Please try again.');
                }
            });
        });

        ffprobeProcess.on('exit', (code) => {
            if (code !== 0) {
                console.error('Failed to get video dimensions. ffprobe process exited with code:', code);
                res.status(500).send('Failed to add watermark to video. Please try again.');
            }
        });
    });
});

app.use('/videosdk', videoApi);
app.use('/agorasdk', agoraSdk);

app.listen(port, () => {
    console.log(`API listening at http://localhost:${port}`);
});
