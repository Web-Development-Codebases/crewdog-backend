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
  const API_KEY = "89132909-c10f-478c-99f5-c9dfc3aa7159";
  const SECRET_KEY = "a3ea6c5fd1fb0fe4d50b07117c98f5d4471738373b16cc2643e46ad03f1ee592";

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

  const url = `https://api.videosdk.live/v2/api/meetings/${meetingId}`;

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
