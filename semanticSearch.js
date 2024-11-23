const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');
const use = require('@tensorflow-models/universal-sentence-encoder');
const admin = require('firebase-admin');

let model;

async function loadModel() {
  model = await use.load();
  console.log('Semantic search model loaded');
}

function isGibberish(text) {
  const cleanText = text.toLowerCase().replace(/[^a-z]/g, '');
  if (/([a-z])\1{2,}/.test(cleanText)) return true;
  const consonantGroups = cleanText.match(/[^aeiou]{4,}/g);
  if (consonantGroups && consonantGroups.length > 0) return true;
  const vowelCount = (cleanText.match(/[aeiou]/g) || []).length;
  const vowelRatio = vowelCount / cleanText.length;
  if (vowelRatio < 0.1 || vowelRatio > 0.8) return true;
  return false;
}

async function isValidQuery(query) {
  if (!query || typeof query !== 'string') return false;
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return false;
  if (isGibberish(cleanQuery)) return false;
  return true;
}

function createSearchContext(text, type) {
  // Enhanced context generation with more specific job-related contexts
  const contexts = {
    'query': [
      `Find ${text} jobs and positions`,
      `Job opportunities for ${text}`,
      `Careers related to ${text}`,
      `${text} job openings`,
      `${text} work positions`,
      // Add specific contexts for common searches
      text.toLowerCase().includes('expat') ? [
        `Jobs for expatriates and international workers`,
        `Positions available for expats`,
        `International job opportunities`,
        `Overseas work positions`,
        `Jobs with relocation`,
        `Global career opportunities`
      ] : [],
      text.toLowerCase().includes('remote') ? [
        `Remote work opportunities`,
        `Work from home positions`,
        `Virtual job opportunities`,
        `Telecommuting positions`
      ] : [],
      text.toLowerCase().includes('engineer') ? [
        `Engineering positions`,
        `Technical roles`,
        `Engineering career opportunities`,
        `Professional engineering work`
      ] : []
    ].flat(),
    'title': [
      `Position title: ${text}`,
      `Job role: ${text}`,
      `Career position: ${text}`,
      text.toLowerCase().includes('expat') ? [
        `International position: ${text}`,
        `Global role: ${text}`,
        `Expatriate position: ${text}`
      ] : []
    ].flat(),
    'description': [
      `Job description: ${text}`,
      `Role details: ${text}`,
      `Position requirements: ${text}`,
      `Work responsibilities: ${text}`
    ]
  };

  return contexts[type].join('. ');
}

async function getEnhancedEmbeddings(text, type) {
  if (!model) throw new Error('Model not loaded');

  const contextText = createSearchContext(text, type);

  const [originalEmbedding, contextEmbedding] = await Promise.all([
    model.embed(text),
    model.embed(contextText)
  ]);

  // Adjusted weighting for better context consideration
  const combined = tf.tidy(() => {
    const orig = tf.tensor2d(originalEmbedding.arraySync());
    const ctx = tf.tensor2d(contextEmbedding.arraySync());
    return tf.add(tf.mul(orig, 0.3), tf.mul(ctx, 0.7)).arraySync()[0];
  });

  return combined;
}

function calculateSemanticSimilarity(queryVec, jobVec, titleVec, query, jobData) {
  const a = tf.tensor1d(queryVec);
  const b = tf.tensor1d(jobVec);
  const c = tf.tensor1d(titleVec);

  const result = tf.tidy(() => {
    const cosineSim = tf.div(
      tf.sum(tf.mul(a, b)),
      tf.mul(tf.sqrt(tf.sum(tf.square(a))), tf.sqrt(tf.sum(tf.square(b))))
    );

    const titleSim = tf.div(
      tf.sum(tf.mul(a, c)),
      tf.mul(tf.sqrt(tf.sum(tf.square(a))), tf.sqrt(tf.sum(tf.square(c))))
    );

    let titleWeight = 0.4;
    let descWeight = 0.6;

    const queryLower = query.toLowerCase();
    const titleLower = jobData.jobTitle.toLowerCase();
    const descLower = jobData.description.toLowerCase();

    if (queryLower.includes('expat') || queryLower.includes('international')) {
      if (titleLower.includes('expat') || descLower.includes('expat') ||
          titleLower.includes('international') || descLower.includes('international') ||
          descLower.includes('relocation') || descLower.includes('overseas')) {
        return tf.add(
          tf.mul(titleSim, 0.3),
          tf.mul(cosineSim, 0.7)
        ).mul(1.5); 
      }
    }

    return tf.add(
      tf.mul(cosineSim, descWeight),
      tf.mul(titleSim, titleWeight)
    );
  }).arraySync();

  tf.dispose([a, b, c]);
  return result;
}

async function semanticSearch(query, db) {
  if (!model) throw new Error('Model not loaded');

  const isValid = await isValidQuery(query);
  if (!isValid) {
    return [];
  }

  console.log(`Performing semantic search for: ${query}`);

  const queryEmbeddings = await getEnhancedEmbeddings(query, 'query');
  const jobListings = await db.collection('jobs').get();
  const results = [];

  for (const job of jobListings.docs) {
    const jobData = job.data();

    const [titleEmbeddings, descriptionEmbeddings] = await Promise.all([
      getEnhancedEmbeddings(jobData.jobTitle, 'title'),
      getEnhancedEmbeddings(jobData.description, 'description')
    ]);

    const similarityScore = calculateSemanticSimilarity(
      queryEmbeddings,
      descriptionEmbeddings,
      titleEmbeddings,
      query,
      jobData
    );

    const queryLower = query.toLowerCase();
    const titleLower = jobData.jobTitle.toLowerCase();
    const descLower = jobData.description.toLowerCase();

    let boostScore = 1;

    if (titleLower.includes(queryLower) || descLower.includes(queryLower)) {
      boostScore = 1.2;
    }

    if (queryLower.includes('expat') && 
        (titleLower.includes('expat') || descLower.includes('expat') ||
         titleLower.includes('international') || descLower.includes('international') ||
         descLower.includes('relocation') || descLower.includes('overseas'))) {
      boostScore *= 1.3;
    }

    results.push({
      ...jobData,
      semanticScore: similarityScore * boostScore
    });
  }

  results.sort((a, b) => b.semanticScore - a.semanticScore);

  const scores = results.map(r => r.semanticScore);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stdDev = Math.sqrt(
    scores.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / scores.length
  );

  const filteredResults = results.filter(result => {
    return (result.semanticScore > mean + stdDev * 0.7) ||
           (result.semanticScore > 0.8); 
  });

  const topResults = filteredResults.slice(0, 10).map(result => ({
    ...result,
    confidence: (result.semanticScore * 100).toFixed(2) + '%'
  }));

  console.log(`Found ${topResults.length} semantically relevant matches`);

  return topResults;
}

module.exports = {
  loadModel,
  semanticSearch
};
