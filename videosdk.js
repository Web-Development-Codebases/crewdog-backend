require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');

const videoApi = express.Router();

// hello world
videoApi.get("/", (req, res) => {
  res.send("Hello World!");
});

// Get token
videoApi.get("/get-token", (req, res) => {
  const API_KEY = "https://api.videosdk.live/v2";
  const SECRET_KEY = "a1af4eb1af094fc85316785d641d18c4e3dd597b1ec6cecc4a76f03c4d29a713";

  const options = { expiresIn: "10m", algorithm: "HS256" };

  const payload = {
    apikey: API_KEY,
    permissions: ["allow_join", "allow_mod"], // also accepts "ask_join"
  };

  const token = jwt.sign(payload, SECRET_KEY, options);
  res.json({ token });
});

// Create meeting
videoApi.post("/create-meeting/", (req, res) => {
  const { token, region } = req.body;
  const url = `https://api.videosdk.live/api/meetings`;
  const options = {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ region }),
  };

  fetch(url, options)
    .then((response) => response.json())
    .then((result) => res.json(result)) // result will contain meetingId
    .catch((error) => console.error("error", error));
});

// Validate meeting
videoApi.post("/validate-meeting/:meetingId", (req, res) => {
  const token = req.body.token;
  const meetingId = req.params.meetingId;

  const url = `${process.env.VIDEOSDK_API_ENDPOINT}/api/meetings/${meetingId}`;

  const options = {
    method: "POST",
    headers: { Authorization: token },
  };

  fetch(url, options)
    .then((response) => response.json())
    .then((result) => res.json(result)) // result will contain meetingId
    .catch((error) => console.error("error", error));
});

module.exports = videoApi;
