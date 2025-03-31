const connection = require('../db');
const axios = require('axios');
const { LanguageServiceClient } = require('@google-cloud/language');
const dotenv = require('dotenv');
dotenv.config();

const languageClient = new LanguageServiceClient();

// Helper: Format a Date as YYYY-MM-DD 
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Helper: Convert Date to Unix timestamp (in seconds)
function getUnixTimestamp(date) {
  return Math.floor(date.getTime() / 1000);
}

// Helper: Format rows into Chart.js data format
function formatChartData(rows) {
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  const labels = rows.map(row => row.date.toString());
  const data = rows.map(row => parseFloat(row.rate));
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
};

// GET /api/currentRate - Use the "latest" endpoint to get current rate 
const getCurrentRate = async (req, res) => {
    try {
      const apiKey = process.env.NAVASAN_API_KEY;
      const response = await axios.get('http://api.navasan.tech/latest/', {
        params: {
          api_key: apiKey,
          item: 'usd'
        }
      });
      console.log("getCurrentRate response data:", response.data);
      if (response.data && response.data.usd && response.data.usd.value) {
        const rate = response.data.usd.value;
        res.json({ currentRate: rate + " IRR per USD" });
      } else {
        res.status(404).json({ error: "No data available for current rate" });
      }
    } catch (error) {
      console.error("Error in getCurrentRate:", error);
      res.status(500).json({ error: "Failed to fetch current rate" });
    }
  };  
  

// GET /api/week - Last 7 days (using Unix timestamps for start/end)
const getWeekData = async (req, res) => {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 6);
    const startTs = getUnixTimestamp(startDate);
    const endTs = getUnixTimestamp(endDate);
    const apiKey = process.env.NAVASAN_API_KEY;
    const response = await axios.get('http://api.navasan.tech/ohlcSearch/', {
      params: {
        api_key: apiKey,
        item: 'usd_sell',
        start: startTs,
        end: endTs
      }
    });
    const data = response.data.map(record => ({
      date: record.date,
      rate: record.close
    }));
    const chartData = formatChartData(data);
    res.json(chartData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch weekly data" });
  }
};

// GET /api/30days - Last 30 days (from 30 days ago to yesterday)
const get30DaysData = async (req, res) => {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);
    const startTs = getUnixTimestamp(startDate);
    const endTs = getUnixTimestamp(endDate);
    const apiKey = process.env.NAVASAN_API_KEY;
    const response = await axios.get('http://api.navasan.tech/ohlcSearch/', {
      params: {
        api_key: apiKey,
        item: 'usd_sell',
        start: startTs,
        end: endTs
      }
    });
    const data = response.data.map(record => ({
      date: record.date,
      rate: record.close
    }));
    const chartData = formatChartData(data);
    res.json(chartData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch 30-day data" });
  }
};

// GET /api/90days - Last 90 days (from 90 days ago to yesterday)
const get90DaysData = async (req, res) => {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 89);
    const startTs = getUnixTimestamp(startDate);
    const endTs = getUnixTimestamp(endDate);
    const apiKey = process.env.NAVASAN_API_KEY;
    const response = await axios.get('http://api.navasan.tech/ohlcSearch/', {
      params: {
        api_key: apiKey,
        item: 'usd_sell',
        start: startTs,
        end: endTs
      }
    });
    const data = response.data.map(record => ({
      date: record.date,
      rate: record.close
    }));
    const chartData = formatChartData(data);
    res.json(chartData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch 90-day data" });
  }
};

// GET /api/news 
const getNews = async (req, res) => {
    try {
      // Use fixed dates for the query:
      const fromDate = "2025-02-28";
      const toDate = "2025-03-30";
      
      const newsResponse = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          apiKey: process.env.NEWS_API_KEY,
          q: 'Iran AND Trump',
          from: fromDate,
          to: toDate,
          sortBy: 'popularity',
          language: 'en',
          pageSize: 100,
          page: 1
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
            // Convert publishedAt to only the date (YYYY-MM-DD)
            const publishedDateString = new Date(article.publishedAt)
              .toISOString()
              .split('T')[0];
    
            // Insert the article into the news_articles table
            const sql = 'INSERT INTO news_articles (title, source, publishedAt, content, sentiment, url) VALUES (?, ?, ?, ?, ?, ?)';
            const values = [
              article.title,
              article.source && article.source.name ? article.source.name : 'Unknown',
              publishedDateString,
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
              publishedAt: publishedDateString,
              sentiment: sentimentLabel,
              description: article.description || '',
              url: article.url || '#'
            };
          } catch (articleError) {
            console.error('Error processing article:', article.title, articleError);
            const publishedDateString = article.publishedAt
              ? new Date(article.publishedAt).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            return {
              title: article.title,
              publishedAt: publishedDateString,
              sentiment: 'error',
              description: article.description || '',
              url: article.url || '#'
            };
          }
        })
      );
      
      // Sort the processed articles by publishedAt 
      processedArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
      
      res.json({ articles: processedArticles });
    } catch (error) {
      console.error('Error in /api/news:', error.message);
      res.status(500).json({ error: 'Failed to fetch or process news articles', details: error.message });
    }
  };    

// GET /api/prediction 

const getPrediction = async (req, res) => {
  try {
    // Call the Python prediction API
    const response = await axios.get('http://localhost:5002/predict');
    // Return the JSON response from the Python API
    res.json(response.data);
  } catch (error) {
    console.error("Error in getPrediction:", error.message);
    res.status(500).json({ error: "Prediction failed", details: error.message });
  }
};

module.exports = {
  // ... other endpoint exports,
  getPrediction
};

   

// GET /api/updateRate - Updates exchange_rates table with yesterday's close rate from Navasan API
const updateRate = async (req, res) => {
  try {
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - 1);
    const dateStr = formatDate(targetDate);
    const apiKey = process.env.NAVASAN_API_KEY;
    const ts = getUnixTimestamp(targetDate);
    const response = await axios.get('http://api.navasan.tech/ohlcSearch/', {
      params: {
        api_key: apiKey,
        item: 'usd_sell',
        start: ts,
        end: ts
      }
    });
    if (!response.data || response.data.length === 0) {
      return res.status(404).json({ error: "No data available for update" });
    }
    const usdToIrr = response.data[0].close;
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
};

module.exports = {
  getCurrentRate,
  getWeekData,
  get30DaysData,
  get90DaysData,
  getNews,
  getPrediction,
  updateRate
};
