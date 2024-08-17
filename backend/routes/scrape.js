const express = require("express");
const axios = require("axios");
const router = express.Router();
const puppeteer = require("puppeteer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { YoutubeTranscript } = require("youtube-transcript");
const { model } = require("mongoose");
require('dotenv').config();

const YOUTUBE_KEY = process.env.YOUTUBE_KEY
const GEMINI_KEY = process.env.GEMINI_KEY
const client = new GoogleGenerativeAI(GEMINI_KEY);
async function fetchYouTubeVideos(productName, numResults) {
  const searchQuery = `${productName} review`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=${numResults}&key=${YOUTUBE_KEY}`;
  
  const response = await axios.get(url);
  const videoIds = response.data.items.map(item => item.id.videoId);
  const videoTitles = response.data.items.map(item => item.snippet.title);

  return [videoIds, videoTitles];
}

function getYoutubeLinks(videoIds) {
  const youtubeLinks = [];
  for (const videoId of videoIds) {
    const youtubeLink = `https://www.youtube.com/watch?v=${videoId}`;
    youtubeLinks.push(youtubeLink);
  }
  return youtubeLinks;
}

async function fetchVideoTranscripts(videoIds) {
  const transcripts = [];

  for (const videoId of videoIds) {
    let textTranscript = ""
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    for (t of transcript) {
      textTranscript += t.text + " "
    }
    transcripts.push(textTranscript);
  }

  return transcripts;
}

async function getSummaries(transcripts, product) {
  const summaries = []
  const model = client.getGenerativeModel({ model: "gemini-pro" })
  const prompt = 'Based on this transcript of this youtube video, give me a detailed summary of the video, specifically outlining the pros and cons of the product they reviewed: ' + product
  for (const transcript of transcripts) {
    const result = await model.generateContent(prompt + transcript);
    const response = await result.response;
    const summary = response.text()
    summaries.push(summary);
  }
  return summaries
}

async function getFinalReview(summaries, product) {
  summaryString = summaries.join('\n')

  const model = client.getGenerativeModel({ model: "gemini-pro" })
  const prompt = `Based on these summaries of multiple youtube videos reviewing ${product}, give a final detailed review of the product that outlines some of the main pros and cons (make it at least one paragraph), and give the product a score between 1 and 100 where 1 is the worst and 100 is the best. Return the data in this JSON format: {review: "review text", pros: ["pro1", "pro2", ...], cons: ["con1", "con2", ...], score: review score (int)}. In your response do not include any formatting or new lines, just provide the raw json text and nothing else. Here are the summaries: ` + summaryString
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const review = response.text()
  return JSON.parse(review)
}


// async function scrape(url) {
//   const browser = await puppeteer.launch();
//   const page = await browser.newPage();
//   await page.goto(url);

//   const data = await page.evaluate(() => {
//     // Replace this with the actual data extraction logic
//     return document.querySelector("h1").innerText;
//   });

//   return data;
// }

router.post("/", async (req, res) => {
  const { product } = req.body;
  const [vidIds, vidTitles] = await fetchYouTubeVideos(product, 3)
  const links = getYoutubeLinks(vidIds)
  const transcripts = await fetchVideoTranscripts(vidIds)
  const summaries = await getSummaries(transcripts, product)
  const review = await getFinalReview(summaries, product)
  res.json({ "review": review["review"], "pros": review["pros"], "cons": review["cons"], "score": review["score"], "videos": links});
});

module.exports = router;
