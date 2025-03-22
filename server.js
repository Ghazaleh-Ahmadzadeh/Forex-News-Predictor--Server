const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
const connection = require('./db'); 
const { LanguageServiceClient } = require('@google-cloud/language');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Google Cloud Natural Language API client
const languageClient = new LanguageServiceClient();

// Helper function: Format a Date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Helper function to format MySQL results into Chart.js data
function formatChartData(rows) {
  // Sort rows in ascending order by date
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = rows.map(row =>
    row.date.toISOString ? row.date.toISOString().split('T')[0] : row.date
  );
  const data = rows.map(row => row.rate);
  return {
    labels,
    datasets: [
      {
        label: 'USD/IRR',
        data,
        borderColor: '#4a90e2',
        fill: false,
        tension: 0.1,
      },
    ],
  };
}

// ------------------------------
// Endpoint: GET /api/currentRate
// Returns the latest exchange rate from the database.
app.get('/api/currentRate', (req, res) => {
  const query = "SELECT rate FROM exchange_rates ORDER BY date DESC LIMIT 1";
  connection.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error fetching current rate" });
    }
    if (results.length === 0) {
      return res.json({ currentRate: "No Data" });
    }
    const rate = results[0].rate;
    res.json({ currentRate: rate + " IRR per USD" });
  });
});

// ------------------------------
// Endpoint: GET /api/week
// Returns the latest 7 days of exchange rate data.
// Updated /api/week to select data from the last 7 days based on date
app.get('/api/week', (req, res) => {
    const query = `
      SELECT date, rate FROM exchange_rates
      WHERE date BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      ORDER BY date ASC
    `;
    connection.query(query, (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching weekly data" });
      }
      const chartData = formatChartData(results);
      res.json(chartData);
    });
  });
  

// ------------------------------
// Endpoint: GET /api/30days
// Returns the latest 30 days of exchange rate data.
app.get('/api/30days', (req, res) => {
  const query = "SELECT date, rate FROM exchange_rates ORDER BY date DESC LIMIT 30";
  connection.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error fetching 30-day data" });
    }
    const chartData = formatChartData(results);
    res.json(chartData);
  });
});

// ------------------------------
// Endpoint: GET /api/90days
// Returns the latest 90 days of exchange rate data.
app.get('/api/90days', (req, res) => {
  const query = "SELECT date, rate FROM exchange_rates ORDER BY date DESC LIMIT 90";
  connection.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Error fetching 90-day data" });
    }
    const chartData = formatChartData(results);
    res.json(chartData);
  });
});

// ------------------------------
// Endpoint: GET /api/news
// Fetches archived news for the past month on the topic "Iran AND Trump",
// performs sentiment analysis on each article, stores them in MySQL,
// and returns only the title, published date, sentiment, description, and url.
app.get('/api/news', async (req, res) => {
    try {
      // Calculate date range for the past month
      const today = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(today.getMonth() - 1);
      const fromDate = formatDate(oneMonthAgo);
      const toDate = formatDate(today);
  
      const newsResponse = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: 'Iran AND Trump',
          from: fromDate,
          to: toDate,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: 100, 
          apiKey: process.env.NEWS_API_KEY,
        },
      });
      console.log('NewsAPI response:', newsResponse.data);
      const articles = newsResponse.data.articles || [];
  
      const processedArticles = await Promise.all(
        articles.map(async (article) => {
          try {
            const textToAnalyze = article.content || article.description || '';
            let sentimentLabel = 'neutral';
            if (textToAnalyze) {
              const document = { content: textToAnalyze, type: 'PLAIN_TEXT' };
              const [result] = await languageClient.analyzeSentiment({ document });
              const sentimentScore = result.documentSentiment.score;
              if (sentimentScore > 0.2) {
                sentimentLabel = 'positive';
              } else if (sentimentScore < -0.2) {
                sentimentLabel = 'negative';
              }
            } else {
              console.warn(`No content to analyze for article: "${article.title}"`);
            }
  
            const publishedAt = article.publishedAt ? new Date(article.publishedAt) : new Date();
  
            const sql = 'INSERT INTO news_articles (title, source, publishedAt, content, sentiment, url) VALUES (?, ?, ?, ?, ?, ?)';
            const values = [
              article.title,
              article.source && article.source.name ? article.source.name : 'Unknown',
              publishedAt,
              article.description || '',
              sentimentLabel,
              article.url || ''
            ];
            connection.query(sql, values, (error) => {
              if (error) {
                console.error('MySQL insert error for article:', article.title, error);
              }
            });

            return {
              title: article.title,
              publishedAt,
              sentiment: sentimentLabel,
              description: article.description || '',
              url: article.url || '#'
            };
          } catch (articleError) {
            console.error('Error processing article:', article.title, articleError);
            return {
              title: article.title,
              publishedAt: article.publishedAt ? new Date(article.publishedAt) : new Date(),
              sentiment: 'error',
              description: article.description || '',
              url: article.url || '#'
            };
          }
        })
      );
  
      res.json({ articles: processedArticles });
    } catch (error) {
      console.error('Error in /api/news:', error);
      res.status(500).json({ error: 'Failed to fetch or process news articles' });
    }
  });
  
// ------------------------------
// Endpoint: GET /api/prediction
// Uses a dummy ML-based prediction by combining the past 30 days of exchange rates
// and news sentiment to predict tomorrow's rate. The confidence is calculated
// dynamically based on the average sentiment and the number of news articles.
app.get('/api/prediction', (req, res) => {
  // Query past 30 days exchange rates
  const rateQuery = "SELECT rate FROM exchange_rates WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
  connection.query(rateQuery, (rateErr, rateResults) => {
    if (rateErr) {
      console.error(rateErr);
      return res.status(500).json({ error: "Error fetching exchange rates" });
    }
    if (!rateResults.length) {
      return res.status(500).json({ error: "No exchange rate data available" });
    }
    const totalRate = rateResults.reduce((sum, row) => sum + parseFloat(row.rate), 0);
    const avgRate = totalRate / rateResults.length;

    // Query past 30 days news sentiment from news_articles
    // Convert sentiment: positive = 1, neutral = 0, negative = -1
    const sentimentQuery = "SELECT sentiment FROM news_articles WHERE publishedAt >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
    connection.query(sentimentQuery, (sentErr, sentResults) => {
      if (sentErr) {
        console.error(sentErr);
        return res.status(500).json({ error: "Error fetching news sentiment" });
      }
      let sentimentSum = 0;
      let count = 0;
      sentResults.forEach(row => {
        if (row.sentiment === 'positive') {
          sentimentSum += 1;
          count++;
        } else if (row.sentiment === 'negative') {
          sentimentSum += -1;
          count++;
        } else if (row.sentiment === 'neutral') {
          sentimentSum += 0;
          count++;
        }
      });
      const avgSentiment = count ? (sentimentSum / count) : 0;
      
      // Dummy ML-based prediction: Adjust the average rate by a small factor based on sentiment.
      const predictedRate = avgRate * (1 + (avgSentiment * 0.001));

      // Calculate confidence dynamically:
      // Base confidence is 50%. Scale additional confidence by the absolute average sentiment,
      // and adjust further if fewer than 30 news articles are available.
      const sentimentFactor = Math.min(count / 30, 1); 
      const confidence = 50 + (Math.abs(avgSentiment) * 50 * sentimentFactor);

      res.json({
        tomorrowsPrediction: predictedRate.toFixed(2) + " IRR",
        confidence: confidence.toFixed(2)
      });
    });
  });
});
// ------------------------------
// Endpoint: GET /api/updateRate
// Fetches the latest exchange rate from Fixer API for yesterday's date
// and updates the exchange_rates table.
app.get('/api/updateRate', async (req, res) => {
    try {
      // Calculate the target date: for example, yesterday.
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - 1);
      const dateStr = formatDate(targetDate);
  
      // Call Fixer API to get the latest exchange rates.
      const fixerResponse = await axios.get('http://data.fixer.io/api/latest', {
        params: {
          access_key: process.env.FIXER_API_KEY,
          symbols: 'USD,IRR'
        }
      });
  
      if (!fixerResponse.data.success) {
        return res.status(500).json({
          error: 'Failed to fetch rate from fixer.io: ' +
            (fixerResponse.data.error ? fixerResponse.data.error.info : 'Unknown error')
        });
      }
  
      const rates = fixerResponse.data.rates;
      const usdToIrr = rates.IRR / rates.USD;
  
      // Insert or update the exchange_rates table.
      const query = `
        INSERT INTO exchange_rates (date, rate) VALUES (?, ?)
        ON DUPLICATE KEY UPDATE rate = ?
      `;
      connection.query(query, [dateStr, usdToIrr, usdToIrr], (err, result) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Failed to update exchange rate" });
        }
        res.json({ message: "Exchange rate updated", date: dateStr, rate: usdToIrr });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  

// ------------------------------
// Start the Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
