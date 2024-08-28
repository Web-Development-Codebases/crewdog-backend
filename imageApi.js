const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const upload = multer({ dest: 'temp_image_uploads/' });

// Ensure AWS SDK is configured in your main app
const s3 = new AWS.S3();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

async function uploadImageToS3(filePath, fileName) {
  const fileContent = await fs.readFile(filePath);
  const params = {
    Bucket: BUCKET_NAME,
    Key: `images/${fileName}`,
    Body: fileContent,
    ContentType: 'image/jpeg' 
  };

  try {
    const data = await s3.upload(params).promise();
    return data.Location;
  } catch (err) {
    console.error("Error uploading image to S3:", err);
    throw err;
  }
}

router.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No image file provided');
  }

  const uniqueId = uuidv4();
  const uploadedFilePath = req.file.path;
  const fileExtension = path.extname(req.file.originalname);
  const newFileName = `${uniqueId}${fileExtension}`;

  try {
    const s3Url = await uploadImageToS3(uploadedFilePath, newFileName);
    res.json({ url: s3Url });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).send(`Failed to process image: ${error.message}`);
  } finally {
    try {
      await fs.unlink(uploadedFilePath);
    } catch (error) {
      console.error('Error cleaning up temporary image file:', error);
    }
  }
});

module.exports = router;