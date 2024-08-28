const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node'); // Add this line to use the Node.js backend
const use = require('@tensorflow-models/universal-sentence-encoder');
const admin = require('firebase-admin');

let model;

async function loadModel() {
  model = await use.load();
  console.log('Semantic search model loaded');
}

async function getEmbeddings(text) {
  if (!model) {
    throw new Error('Model not loaded yet. Please try again in a few moments.');
  }
  const embeddings = await model.embed(text);
  return embeddings.arraySync()[0];
}

function serializeFirestoreDocument(doc) {
  const data = doc.data();
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof admin.firestore.GeoPoint) {
      data[key] = { latitude: value.latitude, longitude: value.longitude };
    } else if (value instanceof admin.firestore.Timestamp) {
      data[key] = value.toDate().toISOString();
    }
  }
  return data;
}

function cosineSimilarity(vecA, vecB) {
  const a = tf.tensor1d(vecA);
  const b = tf.tensor1d(vecB);

  const dotProduct = tf.sum(tf.mul(a, b));
  const normA = tf.sqrt(tf.sum(tf.square(a)));
  const normB = tf.sqrt(tf.sum(tf.square(b)));

  const similarity = tf.div(dotProduct, tf.mul(normA, normB));

  const result = similarity.arraySync();

  tf.dispose([a, b, dotProduct, normA, normB, similarity]);

  return result;
}
async function semanticSearch(query, db) {
  if (!model) {
    throw new Error('Model not loaded yet. Please try again in a few moments.');
  }

  console.log(`Search query: ${query}`);

  const queryEmbedding = await getEmbeddings(query);
  console.log(`Query embedding generated`);

  const jobListings = await db.collection('jobs').get();
  console.log(`Number of job listings found: ${jobListings.size}`);

  const results = [];

  for (const job of jobListings.docs) {
    const jobData = serializeFirestoreDocument(job);
    console.log(`Processing job: ${jobData.jobTitle}`);

    const titleEmbedding = await getEmbeddings(jobData.jobTitle);
    const descriptionEmbedding = await getEmbeddings(jobData.description);

    const titleScore = cosineSimilarity(queryEmbedding, titleEmbedding);
    const descriptionScore = cosineSimilarity(queryEmbedding, descriptionEmbedding);

    const weightedAverageScore = 0.6 * titleScore + 0.4 * descriptionScore;
    jobData.score = weightedAverageScore;

    console.log(`Job "${jobData.jobTitle}" score: ${weightedAverageScore.toFixed(4)}`);

    // Check for exact match in title or description
    const exactMatchTitle = jobData.jobTitle.toLowerCase().includes(query.toLowerCase());
    const exactMatchDescription = jobData.description.toLowerCase().includes(query.toLowerCase());

    if (exactMatchTitle || exactMatchDescription || weightedAverageScore > 0.5) {
      results.push({
        ...jobData,
        exactMatchTitle,
        exactMatchDescription,
        titleScore: titleScore.toFixed(4),
        descriptionScore: descriptionScore.toFixed(4)
      });
      console.log(`Job matched: ${jobData.jobTitle}, Score: ${weightedAverageScore.toFixed(4)}, Exact Match: ${exactMatchTitle || exactMatchDescription}`);
    }
  }

  results.sort((a, b) => {
    // Prioritize exact matches
    if (a.exactMatchTitle || a.exactMatchDescription) return -1;
    if (b.exactMatchTitle || b.exactMatchDescription) return 1;
    // Then sort by score
    return b.score - a.score;
  });

  const topResults = results.slice(0, 10);

  console.log(`Number of search results: ${topResults.length}`);
  console.log(`Search results: ${JSON.stringify(topResults, null, 2)}`);
  return topResults;
}

module.exports = {
  loadModel,
  semanticSearch
};