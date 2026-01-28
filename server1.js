require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const OMDB_BASE = 'http://www.omdbapi.com';

// ===== SIMILARITY CALCULATION =====
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// ===== VERIFY WITH STRICT MATCHING =====
async function verifyMovie(title) {
  try {
    const response = await axios.get(`${TMDB_BASE}/search/movie`, {
      params: { api_key: TMDB_API_KEY, query: title }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      const movie = response.data.results[0];
      const similarity = calculateSimilarity(title.toLowerCase(), movie.title.toLowerCase());
      
      if (similarity < 0.5) {
        console.log(`❌ Rejected movie: "${title}" - Low similarity (${similarity.toFixed(2)})`);
        return { verified: false };
      }
      
      console.log(`✅ Verified movie: "${title}" → "${movie.title}"`);
      return {
        verified: true,
        tmdbId: movie.id,
        title: movie.title,
        genres: movie.genre_ids
      };
    }
    
    return { verified: false };
  } catch (error) {
    return { verified: false };
  }
}

async function verifySeries(title) {
  try {
    const response = await axios.get(`${TMDB_BASE}/search/tv`, {
      params: { api_key: TMDB_API_KEY, query: title }
    });
    
    if (response.data.results && response.data.results.length > 0) {
      const series = response.data.results[0];
      const similarity = calculateSimilarity(title.toLowerCase(), series.name.toLowerCase());
      
      if (similarity < 0.5) {
        console.log(`❌ Rejected series: "${title}" - Low similarity (${similarity.toFixed(2)})`);
        return { verified: false };
      }
      
      console.log(`✅ Verified series: "${title}" → "${series.name}"`);
      return {
        verified: true,
        tmdbId: series.id,
        title: series.name,
        genres: series.genre_ids
      };
    }
    
    return { verified: false };
  } catch (error) {
    return { verified: false };
  }
}

// ===== DISCOVER CONTENT =====
async function discoverMovies(genreIds, excludeTitles, page = null) {
  try {
    const targetPage = page || Math.floor(Math.random() * 5) + 1;
    
    const response = await axios.get(`${TMDB_BASE}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_genres: genreIds.join(','),
        sort_by: 'vote_average.desc',
        'vote_count.gte': 500,
        page: targetPage
      }
    });
    
    if (!response.data.results) return [];
    
    return response.data.results.filter(m => 
      !excludeTitles.some(e => m.title.toLowerCase() === e.toLowerCase())
    );
    
  } catch (error) {
    console.error('Discover movies error:', error.message);
    return [];
  }
}

async function discoverSeries(genreIds, excludeTitles, page = null) {
  try {
    const targetPage = page || Math.floor(Math.random() * 5) + 1;
    
    const response = await axios.get(`${TMDB_BASE}/discover/tv`, {
      params: {
        api_key: TMDB_API_KEY,
        with_genres: genreIds.join(','),
        sort_by: 'vote_average.desc',
        'vote_count.gte': 300,
        page: targetPage
      }
    });
    
    if (!response.data.results) return [];
    
    return response.data.results.filter(s => 
      !excludeTitles.some(e => s.name.toLowerCase() === e.toLowerCase())
    );
    
  } catch (error) {
    console.error('Discover series error:', error.message);
    return [];
  }
}

async function discoverMusic(genreIds) {
  try {
    const musicKeywords = [10402];
    const combinedGenres = [...new Set([...genreIds, ...musicKeywords])];
    
    const targetPage = Math.floor(Math.random() * 3) + 1;
    
    const response = await axios.get(`${TMDB_BASE}/discover/movie`, {
      params: {
        api_key: TMDB_API_KEY,
        with_genres: combinedGenres.join(','),
        with_keywords: '186447|9715|6075',
        sort_by: 'vote_average.desc',
        'vote_count.gte': 100,
        page: targetPage
      }
    });
    
    if (!response.data.results) return [];
    
    return response.data.results.map(movie => ({
      title: `${movie.title} (Original Soundtrack)`,
      year: movie.release_date ? movie.release_date.split('-')[0] : null,
      description: movie.overview ? movie.overview.slice(0, 150) : 'Film soundtrack and score',
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null
    }));
    
  } catch (error) {
    console.error('Discover music error:', error.message);
    return [];
  }
}

// ===== GENRE MAPPING =====
const GENRE_MAP = {
  rock: [28, 53, 18, 10402],
  electronic: [878, 53, 10402],
  jazz: [18, 10402, 36],
  hiphop: [80, 28, 10402],
  indie: [18, 35, 10749, 10402],
  classical: [18, 36, 10402],
  pop: [35, 10749, 10402],
  metal: [27, 53, 10402],
  ambient: [878, 9648, 10402],
  folk: [18, 37, 10402]
};

// ===== MAIN RECOMMENDATION ENGINE =====
async function generateRecommendations(mode, data) {
  console.log('🎯 Mode:', mode);
  console.log('📊 Input:', data);
  
  let genreIds = [];
  let excludeMovies = [];
  let excludeSeries = [];
  
  if (mode === 'names') {
    const { movies = [], series = [] } = data;
    
    for (const movieTitle of movies) {
      const verified = await verifyMovie(movieTitle);
      
      if (!verified.verified) {
        throw new Error(`"${movieTitle}" not found on TMDB. Please check spelling.`);
      }
      
      genreIds.push(...verified.genres);
      excludeMovies.push(verified.title);
    }
    
    for (const seriesTitle of series) {
      const verified = await verifySeries(seriesTitle);
      
      if (!verified.verified) {
        throw new Error(`"${seriesTitle}" not found on TMDB. Please check spelling.`);
      }
      
      genreIds.push(...verified.genres);
      excludeSeries.push(verified.title);
    }
    
  } else if (mode === 'genres') {
    const { musicGenres = [] } = data;
    
    for (const genre of musicGenres) {
      if (GENRE_MAP[genre]) {
        genreIds.push(...GENRE_MAP[genre]);
      }
    }
  }
  
  genreIds = [...new Set(genreIds)];
  console.log('🧬 Genre IDs:', genreIds);
  
  if (genreIds.length === 0) {
    throw new Error('No valid genres detected');
  }
  
  const allMovies = [];
  const allSeries = [];
  const allMusic = [];
  
  for (let page = 1; page <= 3; page++) {
    const movies = await discoverMovies(genreIds, excludeMovies, page);
    const series = await discoverSeries(genreIds, excludeSeries, page);
    
    allMovies.push(...movies);
    allSeries.push(...series);
  }
  
  const musicResults = await discoverMusic(genreIds);
  allMusic.push(...musicResults);
  
  const shuffledMovies = allMovies.sort(() => Math.random() - 0.5).slice(0, 6);
  const shuffledSeries = allSeries.sort(() => Math.random() - 0.5).slice(0, 6);
  const shuffledMusic = allMusic.sort(() => Math.random() - 0.5).slice(0, 6);
  
  console.log(`✅ Found: ${shuffledMovies.length} movies, ${shuffledSeries.length} series, ${shuffledMusic.length} music`);
  
  return {
    movies: shuffledMovies.map(m => ({
      title: m.title,
      year: m.release_date ? m.release_date.split('-')[0] : null,
      rating: m.vote_average ? `⭐ ${m.vote_average.toFixed(1)}/10` : null,
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      description: m.overview,
      googleLink: `https://www.google.com/search?q=${encodeURIComponent(m.title + ' watch online')}`
    })),
    series: shuffledSeries.map(s => ({
      title: s.name,
      year: s.first_air_date ? s.first_air_date.split('-')[0] : null,
      rating: s.vote_average ? `⭐ ${s.vote_average.toFixed(1)}/10` : null,
      poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
      description: s.overview,
      googleLink: `https://www.google.com/search?q=${encodeURIComponent(s.name + ' watch online')}`
    })),
    music: shuffledMusic
  };
}

// ===== ARCHIVE: MOVIES & SERIES AROUND THIS DAY =====
async function getMoviesAroundThisDay() {
  try {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    
    const startDate = new Date(today);
    startDate.setDate(day - 3);
    const endDate = new Date(today);
    endDate.setDate(day + 3);
    
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(startDate.getDate()).padStart(2, '0');
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDate.getDate()).padStart(2, '0');
    
    console.log(`🗓️ Searching for content released around ${month}/${day} (±3 days) across all years`);
    
    const isInDateRange = (dateString) => {
      if (!dateString) return false;
      const parts = dateString.split('-');
      const releaseMonth = parseInt(parts[1]);
      const releaseDay = parseInt(parts[2]);
      
      const startMonthNum = parseInt(startMonth);
      const endMonthNum = parseInt(endMonth);
      
      if (startMonthNum === endMonthNum) {
        return releaseMonth === startMonthNum && 
               releaseDay >= parseInt(startDay) && 
               releaseDay <= parseInt(endDay);
      } else {
        return (releaseMonth === startMonthNum && releaseDay >= parseInt(startDay)) ||
               (releaseMonth === endMonthNum && releaseDay <= parseInt(endDay));
      }
    };
    
    const moviesPromises = [];
    const currentYear = today.getFullYear();
    
    for (let year = 1940; year <= currentYear; year++) {
      for (let page = 1; page <= 2; page++) {
        moviesPromises.push(
          axios.get(`${TMDB_BASE}/discover/movie`, {
            params: {
              api_key: TMDB_API_KEY,
              'primary_release_date.gte': `${year}-${startMonth}-${startDay}`,
              'primary_release_date.lte': `${year}-${endMonth}-${endDay}`,
              sort_by: 'popularity.desc',
              page: page
            }
          }).catch(() => ({ data: { results: [] } }))
        );
      }
    }
    
    const seriesPromises = [];
    for (let year = 1940; year <= currentYear; year++) {
      for (let page = 1; page <= 3; page++) {
        seriesPromises.push(
          axios.get(`${TMDB_BASE}/discover/tv`, {
            params: {
              api_key: TMDB_API_KEY,
              'first_air_date.gte': `${year}-${startMonth}-${startDay}`,
              'first_air_date.lte': `${year}-${endMonth}-${endDay}`,
              sort_by: 'popularity.desc',
              page: page
            }
          }).catch(() => ({ data: { results: [] } }))
        );
      }
    }
    
    const [moviesResponses, seriesResponses] = await Promise.all([
      Promise.all(moviesPromises),
      Promise.all(seriesPromises)
    ]);
    
    const allMovies = [];
    moviesResponses.forEach(response => {
      if (response.data.results) {
        const filtered = response.data.results.filter(m => isInDateRange(m.release_date));
        allMovies.push(...filtered);
      }
    });
    
    const allSeries = [];
    seriesResponses.forEach(response => {
      if (response.data.results) {
        const filtered = response.data.results.filter(s => isInDateRange(s.first_air_date));
        allSeries.push(...filtered);
      }
    });  
    
    const uniqueMovies = Array.from(new Map(allMovies.map(m => [m.id, m])).values())
      .filter(m => m.vote_count >= 100) // Only include movies with enough votes
      .sort((a, b) => {
        if (b.vote_average !== a.vote_average) {
          return b.vote_average - a.vote_average;
        }
        return b.popularity - a.popularity;
      })
      .slice(0, 18);
    
    const uniqueSeries = Array.from(new Map(allSeries.map(s => [s.id, s])).values())
      .filter(s => s.vote_count >= 50) // Only include series with enough votes
      .sort((a, b) => {
        if (b.vote_average !== a.vote_average) {
          return b.vote_average - a.vote_average;
        }
        return b.popularity - a.popularity;
      })
      .slice(0, 18);
    
    console.log(`✅ Found ${uniqueMovies.length} movies and ${uniqueSeries.length} series released around this day in history`);
    
    const formattedMovies = uniqueMovies.map(m => ({
      title: m.title,
      year: m.release_date ? m.release_date.split('-')[0] : null,
      releaseDate: m.release_date,
      rating: m.vote_average ? `⭐ ${m.vote_average.toFixed(1)}/10` : null,
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      description: m.overview || 'No description available.',
      googleLink: `https://www.google.com/search?q=${encodeURIComponent(m.title + ' ' + (m.release_date ? m.release_date.split('-')[0] : '') + ' watch online')}`
    }));
    
    const formattedSeries = uniqueSeries.map(s => ({
      title: s.name,
      year: s.first_air_date ? s.first_air_date.split('-')[0] : null,
      releaseDate: s.first_air_date,
      rating: s.vote_average ? `⭐ ${s.vote_average.toFixed(1)}/10` : null,
      poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null,
      description: s.overview || 'No description available.',
      googleLink: `https://www.google.com/search?q=${encodeURIComponent(s.name + ' watch online')}`
    }));
    
    return {
      movies: formattedMovies,
      series: formattedSeries
    };
    
  } catch (error) {
    console.error('Archive error:', error.message);
    return { movies: [], series: [] };
  }
}

// ===== NEWS =====
async function getLatestHollywoodNews() {
  try {
    console.log('📰 Fetching latest Hollywood news...');
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        apiKey: NEWS_API_KEY,
        q: 'Hollywood OR movie OR film OR cinema OR actor OR actress',
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 12,
        domains: 'hollywoodreporter.com,variety.com,deadline.com,thewrap.com,ew.com,indiewire.com'
      }
    });
    
    if (!response.data.articles) {
      return [];
    }
    
    console.log(`✅ Found ${response.data.articles.length} news articles`);
    
    return response.data.articles.map(article => ({
      title: article.title,
      description: article.description || 'No description available.',
      source: article.source.name,
      author: article.author || 'Unknown',
      publishedAt: new Date(article.publishedAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }),
      url: article.url,
      image: article.urlToImage || null
    }));
    
  } catch (error) {
    console.error('News API error:', error.message);
    return [];
  }
}

// ===== ENDPOINTS =====
app.post('/recommend', async (req, res) => {
  const { mode, data } = req.body;
  
  try {
    const recommendations = await generateRecommendations(mode, data);
    res.json({ success: true, recommendations });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message
    });
  }
});

app.get('/archive', async (req, res) => {
  try {
    const content = await getMoviesAroundThisDay();
    const today = new Date();
    const threeDaysBefore = new Date(today);
    threeDaysBefore.setDate(today.getDate() - 3);
    const threeDaysAfter = new Date(today);
    threeDaysAfter.setDate(today.getDate() + 3);
    
    const formatDate = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const formattedDateRange = `${formatDate(threeDaysBefore)} - ${formatDate(threeDaysAfter)}`;
    
    res.json({ 
      success: true, 
      dateRange: formattedDateRange,
      movies: content.movies,
      series: content.series,
      totalMovies: content.movies.length,
      totalSeries: content.series.length
    });
  } catch (error) {
    console.error('❌ Archive Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

app.get('/news', async (req, res) => {
  try {
    const news = await getLatestHollywoodNews();
    
    res.json({ 
      success: true, 
      articles: news,
      total: news.length
    });
  } catch (error) {
    console.error('❌ News Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});
app.post('/search-by-country', async (req, res) => {
  const { country, yearStart, yearEnd, type } = req.body;
  
  try {
    console.log(`🔍 Searching: ${country}, ${yearStart}-${yearEnd}, ${type}`);
    
    const results = [];
    
    // Search movies
    if (type === 'movie' || type === 'both') {
      for (let page = 1; page <= 3; page++) {
        const movieResponse = await axios.get(`${TMDB_BASE}/discover/movie`, {
          params: {
            api_key: TMDB_API_KEY,
            with_origin_country: country,
            'primary_release_date.gte': `${yearStart}-01-01`,
            'primary_release_date.lte': `${yearEnd}-12-31`,
            sort_by: 'vote_average.desc',
            'vote_count.gte': 50,
            page: page
          }
        }).catch(() => ({ data: { results: [] } }));
        
        if (movieResponse.data.results) {
          results.push(...movieResponse.data.results);
        }
      }
    }
    
    // Search series
    if (type === 'tv' || type === 'both') {
      for (let page = 1; page <= 3; page++) {
        const tvResponse = await axios.get(`${TMDB_BASE}/discover/tv`, {
          params: {
            api_key: TMDB_API_KEY,
            with_origin_country: country,
            'first_air_date.gte': `${yearStart}-01-01`,
            'first_air_date.lte': `${yearEnd}-12-31`,
            sort_by: 'vote_average.desc',
            'vote_count.gte': 30,
            page: page
          }
        }).catch(() => ({ data: { results: [] } }));
        
        if (tvResponse.data.results) {
          results.push(...tvResponse.data.results);
        }
      }
    }
    
    // Remove duplicates and sort by rating
    const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values())
      .sort((a, b) => b.vote_average - a.vote_average);
    
    console.log(`✅ Found ${uniqueResults.length} results`);
    
    res.json({ 
      success: true, 
      results: uniqueResults.slice(0, 18)
    });
    
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});
app.get('/test', (req, res) => {
  res.json({ 
    message: 'UNIFIED Algorithm Server 🔥',
    tmdb: !!TMDB_API_KEY ? '✅' : '❌',
    news: !!NEWS_API_KEY ? '✅' : '❌',
    algorithm: 'Same discovery logic for Movies, Series, AND Music'
  });
});

const PORT = 3001;

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION:', err);
  process.exit(1);
});

function generatePopularityOptions(popularity) {
  if (!popularity) return ['500 points', '1000 points', '1500 points'];
  const pop = Math.floor(popularity);
  return [
    `${pop - 200} points`,
    `${pop + 300} points`,
    `${pop + 600} points`
  ];
}

function generateWriterOptions() {
  return ['Aaron Sorkin', 'Charlie Kaufman', 'Quentin Tarantino'];
}

function generateVoteOptions(votes) {
  if (!votes) return ['5k+ votes', '10k+ votes', '20k+ votes'];
  const k = Math.floor(votes / 1000);
  return [
    `${k - 3}k+ votes`,
    `${k + 5}k+ votes`,
    `${k + 10}k+ votes`
  ];
}

function generateRevenueOptions(revenue) {
  if (!revenue) return ['$50 million', '$150 million', '$300 million'];
  const revenueM = revenue / 1000000;
  return [
    `$${(revenueM * 0.6).toFixed(0)} million`,
    `$${(revenueM * 1.3).toFixed(0)} million`,
    `$${(revenueM * 2).toFixed(0)} million`
  ];
}

function generateCountryOptions() {
  return ['United States', 'United Kingdom', 'France', 'Germany'];
}

// Helper functions for generating wrong answers
function generateYearOptions(releaseDate) {
  if (!releaseDate) return ['2020', '2015', '2010'];
  const year = parseInt(releaseDate.split('-')[0]);
  return [
    String(year - 2),
    String(year + 3),
    String(year - 5)
  ];
}

function generateDirectorOptions(director) {
  const directors = ['Steven Spielberg', 'Christopher Nolan', 'Martin Scorsese', 'Quentin Tarantino'];
  return directors.filter(d => d !== (director ? director.name : '')).slice(0, 3);
}

function generateGenreOptions(mainGenre) {
  const genres = ['Action', 'Drama', 'Comedy', 'Thriller', 'Horror', 'Sci-Fi'];
  return genres.filter(g => g !== (mainGenre ? mainGenre.name : '')).slice(0, 3);
}

function generateTaglineOptions() {
  return [
    'The adventure of a lifetime',
    'Nothing will ever be the same',
    'The story that changed everything'
  ];
}

function generateBudgetOptions(budget) {
  if (!budget) return ['$50 million', '$100 million', '$200 million'];
  const budgetM = budget / 1000000;
  return [
    `$${(budgetM * 0.5).toFixed(0)} million`,
    `$${(budgetM * 1.5).toFixed(0)} million`,
    `$${(budgetM * 2).toFixed(0)} million`
  ];
}

function generateCompanyOptions() {
  return ['Warner Bros.', 'Universal Pictures', 'Paramount Pictures'];
}

function generateRatingOptions(rating) {
  if (!rating) return ['7.5/10', '8.0/10', '6.5/10'];
  return [
    `${(rating - 1).toFixed(1)}/10`,
    `${(rating + 0.5).toFixed(1)}/10`,
    `${(rating - 0.3).toFixed(1)}/10`
  ];
}
function generateDecadeOptions(releaseDate) {
  if (!releaseDate) return ['1990s', '2000s', '2010s'];
  const year = parseInt(releaseDate.split('-')[0]);
  const decade = Math.floor(year / 10) * 10;
  return [
    `${decade - 10}s`,
    `${decade + 10}s`,
    `${decade - 20}s`
  ].filter(d => d !== `${decade}s`).slice(0, 3);
}

function generateRatingCategoryOptions(rating) {
  if (!rating) return ['Good (7-8)', 'Average (6-7)', 'Poor (below 6)'];
  if (rating >= 8) return ['Good (7-8)', 'Average (6-7)', 'Below Average'];
  if (rating >= 7) return ['Excellent (8+)', 'Average (6-7)', 'Below Average'];
  if (rating >= 6) return ['Excellent (8+)', 'Good (7-8)', 'Below Average'];
  return ['Excellent (8+)', 'Good (7-8)', 'Average (6-7)'];
}

function generateCastPairOptions(cast) {
  const pairs = [];
  if (cast[0] && cast[2]) pairs.push(`${cast[0].name} & ${cast[2].name}`);
  if (cast[1] && cast[3]) pairs.push(`${cast[1].name} & ${cast[3].name}`);
  if (cast[2] && cast[3]) pairs.push(`${cast[2].name} & ${cast[3].name}`);
  return pairs.slice(0, 3);
}

function generateHourOptions(runtime) {
  if (!runtime) return ['2h 0m', '2h 30m', '3h 0m'];
  const hours = Math.floor(runtime / 60);
  const mins = runtime % 60;
  return [
    `${hours - 1}h ${mins}m`,
    `${hours}h ${mins + 20}m`,
    `${hours + 1}h ${mins - 10}m`
  ];
}

function generateCrewOptions() {
  return ['Roger Deakins', 'Emmanuel Lubezki', 'Hoyte van Hoytema'];
}

function generateProfitOptions(revenue, budget) {
  if (!revenue || !budget) return ['$50 million profit', '$100 million profit', '$200 million profit'];
  const profit = (revenue - budget) / 1000000;
  return [
    `$${(profit * 0.5).toFixed(0)} million profit`,
    `$${(profit * 1.5).toFixed(0)} million profit`,
    `$${(profit * 2).toFixed(0)} million profit`
  ];
}

function generateCompanyCountOptions(count) {
  if (!count) return ['2 companies', '3 companies', '5 companies'];
  return [
    `${count - 1} companies`,
    `${count + 2} companies`,
    `${count + 5} companies`
  ];
}

function generateExactVoteOptions(votes) {
  if (!votes) return ['5,000 votes', '10,000 votes', '25,000 votes'];
  return [
    `${(votes - 2000).toLocaleString()} votes`,
    `${(votes + 3000).toLocaleString()} votes`,
    `${(votes + 8000).toLocaleString()} votes`
  ];
}

function generateLanguageCountOptions(count) {
  if (!count) return ['2 language(s)', '3 language(s)', '5 language(s)'];
  return [
    `${count - 1} language(s)`,
    `${count + 1} language(s)`,
    `${count + 3} language(s)`
  ];
}

function generatePercentageOptions(rating) {
  if (!rating) return ['60% positive', '75% positive', '85% positive'];
  const percent = ((rating / 10) * 100).toFixed(0);
  return [
    `${percent - 15}% positive`,
    `${parseInt(percent) + 10}% positive`,
    `${parseInt(percent) + 20}% positive`
  ];
}
// ===== TRIVIA ENDPOINT =====
app.post('/trivia', async (req, res) => {
  const { movieName, questionCount, difficulty } = req.body;
  
  try {
    console.log(`🎮 Generating ${questionCount} ${difficulty} questions for: ${movieName}`);
    
    // Step 1: Get movie from TMDB
    const searchResponse = await axios.get(`${TMDB_BASE}/search/movie`, {
      params: { api_key: TMDB_API_KEY, query: movieName }
    });
    
    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      throw new Error(`Movie "${movieName}" not found. Please check the spelling.`);
    }
    
    const movie = searchResponse.data.results[0];
    const movieId = movie.id;
    
    // Step 2: Get detailed movie info
    const [detailsResponse, creditsResponse, imagesResponse] = await Promise.all([
      axios.get(`${TMDB_BASE}/movie/${movieId}`, {
        params: { api_key: TMDB_API_KEY }
      }),
      axios.get(`${TMDB_BASE}/movie/${movieId}/credits`, {
        params: { api_key: TMDB_API_KEY }
      }),
      axios.get(`${TMDB_BASE}/movie/${movieId}/images`, {
        params: { api_key: TMDB_API_KEY }
      })
    ]);
    
    const details = detailsResponse.data;
    const credits = creditsResponse.data;
    const images = imagesResponse.data.backdrops || [];
    
    // Step 3: Generate questions based on difficulty
    const questions = generateQuestions(details, credits, images, questionCount, difficulty);
    
    console.log(`✅ Generated ${questions.length} questions`);
    
    res.json({ 
      success: true, 
      questions,
      movieTitle: details.title
    });
    
  } catch (error) {
    console.error('❌ Trivia Error:', error.message);
    res.status(400).json({ 
      success: false,
      error: error.message
    });
  }
});

function generateQuestions(details, credits, images, count, difficulty) {
  const questions = [];
  const cast = credits.cast || [];
  const crew = credits.crew || [];
  const director = crew.find(c => c.job === 'Director');
  const writer = crew.find(c => c.job === 'Screenplay' || c.job === 'Writer');
  
  // Expanded question bank with MORE questions per difficulty
  const questionBank = {
  easy: [
    {
      question: `What year was "${details.title}" released?`,
      correct: details.release_date ? details.release_date.split('-')[0] : 'Unknown',
      wrong: generateYearOptions(details.release_date),
      explanation: `${details.title} was released in ${details.release_date ? details.release_date.split('-')[0] : 'Unknown'}.`
    },
    {
      question: `Who directed "${details.title}"?`,
      correct: director ? director.name : 'Unknown',
      wrong: generateDirectorOptions(director),
      explanation: `${details.title} was directed by ${director ? director.name : 'Unknown'}.`
    },
    {
      question: `What is the runtime of "${details.title}"?`,
      correct: `${details.runtime} minutes`,
      wrong: [`${details.runtime - 20} minutes`, `${details.runtime + 15} minutes`, `${details.runtime + 30} minutes`],
      explanation: `The movie runs for ${details.runtime} minutes.`
    },
    {
      question: `What is the main genre of "${details.title}"?`,
      correct: details.genres[0] ? details.genres[0].name : 'Unknown',
      wrong: generateGenreOptions(details.genres[0]),
      explanation: `The movie is primarily a ${details.genres[0] ? details.genres[0].name : 'Unknown'} film.`
    },
    {
      question: `What language is "${details.title}" primarily in?`,
      correct: details.original_language === 'en' ? 'English' : details.original_language.toUpperCase(),
      wrong: ['Spanish', 'French', 'German'].filter(l => l !== (details.original_language === 'en' ? 'English' : details.original_language)),
      explanation: `The movie is primarily in ${details.original_language === 'en' ? 'English' : details.original_language.toUpperCase()}.`
    },
    {
      question: `Is "${details.title}" suitable for all ages?`,
      correct: details.adult ? 'No, it\'s rated for adults' : 'Yes, it\'s family-friendly',
      wrong: details.adult ? ['Yes, it\'s family-friendly', 'It\'s only for teenagers', 'It\'s a children\'s movie'] : ['No, it\'s rated for adults', 'It\'s only for teenagers', 'It\'s restricted'],
      explanation: details.adult ? 'This movie is rated for adult audiences.' : 'This movie is suitable for general audiences.'
    },
    {
      question: `Who is the lead actor in "${details.title}"?`,
      correct: cast[0] ? cast[0].name : 'Unknown',
      wrong: [cast[1]?.name, cast[2]?.name, cast[3]?.name].filter(Boolean),
      explanation: `${cast[0] ? cast[0].name : 'Unknown'} is the lead actor.`
    },
    {
      question: `What type of movie is "${details.title}"?`,
      correct: details.genres[1] ? details.genres[1].name : (details.genres[0] ? details.genres[0].name : 'Unknown'),
      wrong: generateGenreOptions(details.genres[1] || details.genres[0]),
      explanation: `It's a ${details.genres[1] ? details.genres[1].name : (details.genres[0] ? details.genres[0].name : 'Unknown')} film.`
    },
    {
      question: `What is the original language of "${details.title}"?`,
      correct: details.spoken_languages[0] ? details.spoken_languages[0].english_name : 'English',
      wrong: ['French', 'Spanish', 'Mandarin'].filter(l => l !== (details.spoken_languages[0]?.english_name || 'English')),
      explanation: `The original language is ${details.spoken_languages[0] ? details.spoken_languages[0].english_name : 'English'}.`
    },
    {
      question: `How popular is "${details.title}" on TMDB?`,
      correct: details.popularity > 50 ? 'Very Popular' : details.popularity > 20 ? 'Moderately Popular' : 'Cult Classic',
      wrong: details.popularity > 50 ? ['Moderately Popular', 'Cult Classic', 'Unknown'] : ['Very Popular', 'Blockbuster', 'Unknown'],
      explanation: `The movie has a popularity score of ${details.popularity ? details.popularity.toFixed(0) : 'Unknown'}.`
    },
    {
      question: `Does "${details.title}" have a sequel?`,
      correct: details.belongs_to_collection ? 'Yes, it\'s part of a series' : 'No, it\'s a standalone film',
      wrong: details.belongs_to_collection ? ['No, it\'s a standalone film', 'It has a prequel only', 'It has a remake'] : ['Yes, it\'s part of a series', 'Multiple sequels exist', 'It has a prequel'],
      explanation: details.belongs_to_collection ? `Yes, it's part of the ${details.belongs_to_collection.name}.` : 'No, this is a standalone film.'
    },
    {
      question: `What decade was "${details.title}" released in?`,
      correct: details.release_date ? `${Math.floor(parseInt(details.release_date.split('-')[0]) / 10) * 10}s` : 'Unknown',
      wrong: generateDecadeOptions(details.release_date),
      explanation: `The movie was released in the ${details.release_date ? Math.floor(parseInt(details.release_date.split('-')[0]) / 10) * 10 : 'Unknown'}s.`
    },
    {
      question: `Is "${details.title}" based on a true story?`,
      correct: details.genres.some(g => g.name === 'Documentary' || g.name === 'History') ? 'Yes' : 'No',
      wrong: details.genres.some(g => g.name === 'Documentary' || g.name === 'History') ? ['No', 'Partially', 'It\'s inspired by events'] : ['Yes', 'Partially', 'Based on a book'],
      explanation: details.genres.some(g => g.name === 'Documentary' || g.name === 'History') ? 'Yes, it\'s based on real events.' : 'No, it\'s a fictional story.'
    },
    {
      question: `What rating does "${details.title}" have?`,
      correct: details.vote_average >= 8 ? 'Excellent (8+)' : details.vote_average >= 7 ? 'Good (7-8)' : details.vote_average >= 6 ? 'Average (6-7)' : 'Below Average',
      wrong: generateRatingCategoryOptions(details.vote_average),
      explanation: `The movie has a ${details.vote_average ? details.vote_average.toFixed(1) : 'Unknown'}/10 rating.`
    },
    {
      question: `Who are the main stars of "${details.title}"?`,
      correct: cast[0] && cast[1] ? `${cast[0].name} & ${cast[1].name}` : 'Unknown',
      wrong: generateCastPairOptions(cast),
      explanation: `The main stars are ${cast[0] && cast[1] ? cast[0].name + ' and ' + cast[1].name : 'Unknown'}.`
    }
  ],
  medium: [
    {
      question: `Who played the lead role in "${details.title}"?`,
      correct: cast[0] ? cast[0].name : 'Unknown',
      wrong: cast.slice(1, 4).map(c => c.name),
      explanation: `${cast[0] ? cast[0].name : 'Unknown'} played the lead role.`
    },
    {
      question: `Which actor played "${cast[1] ? cast[1].character : 'a major character'}" in the movie?`,
      correct: cast[1] ? cast[1].name : 'Unknown',
      wrong: [cast[0]?.name, cast[2]?.name, cast[3]?.name].filter(Boolean),
      explanation: `${cast[1] ? cast[1].name : 'Unknown'} played this role.`
    },
    {
      question: `What is the tagline of "${details.title}"?`,
      correct: details.tagline || 'No official tagline',
      wrong: generateTaglineOptions(),
      explanation: details.tagline ? `The tagline is: "${details.tagline}"` : 'This movie has no official tagline.'
    },
    {
      question: `What is the popularity score of "${details.title}"?`,
      correct: details.popularity ? `${details.popularity.toFixed(0)} points` : 'Unknown',
      wrong: generatePopularityOptions(details.popularity),
      explanation: `The movie has a popularity score of ${details.popularity ? details.popularity.toFixed(0) : 'Unknown'} on TMDB.`
    },
    {
      question: `Who wrote the screenplay for "${details.title}"?`,
      correct: writer ? writer.name : 'Unknown',
      wrong: generateWriterOptions(),
      explanation: `The screenplay was written by ${writer ? writer.name : 'Unknown'}.`
    },
    {
      question: `How many votes does "${details.title}" have on TMDB?`,
      correct: details.vote_count ? `${Math.floor(details.vote_count / 1000)}k+ votes` : 'Unknown',
      wrong: generateVoteOptions(details.vote_count),
      explanation: `The movie has received ${details.vote_count ? Math.floor(details.vote_count / 1000) + 'k+' : 'Unknown'} votes.`
    },
    {
      question: `What character does ${cast[2] ? cast[2].name : 'the third actor'} play?`,
      correct: cast[2] ? cast[2].character : 'Unknown',
      wrong: [cast[0]?.character, cast[1]?.character, cast[3]?.character].filter(Boolean),
      explanation: `${cast[2] ? cast[2].name : 'Unknown'} plays ${cast[2] ? cast[2].character : 'Unknown'}.`
    },
    {
      question: `What is a secondary genre of "${details.title}"?`,
      correct: details.genres[1] ? details.genres[1].name : (details.genres[0] ? details.genres[0].name : 'Unknown'),
      wrong: generateGenreOptions(details.genres[1]),
      explanation: `A secondary genre is ${details.genres[1] ? details.genres[1].name : 'Unknown'}.`
    },
    {
      question: `How long is "${details.title}" in hours?`,
      correct: details.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : 'Unknown',
      wrong: generateHourOptions(details.runtime),
      explanation: `The movie is ${details.runtime ? Math.floor(details.runtime / 60) + 'h ' + (details.runtime % 60) + 'm' : 'Unknown'} long.`
    },
    {
      question: `Is "${details.title}" part of a collection?`,
      correct: details.belongs_to_collection ? details.belongs_to_collection.name : 'No collection',
      wrong: details.belongs_to_collection ? ['Marvel Cinematic Universe', 'DC Extended Universe', 'Star Wars Saga'] : [details.title + ' Trilogy', details.title + ' Series', details.title + ' Collection'],
      explanation: details.belongs_to_collection ? `Yes, it's part of ${details.belongs_to_collection.name}.` : 'No, it\'s a standalone film.'
    },
    {
      question: `Who is the cinematographer of "${details.title}"?`,
      correct: crew.find(c => c.job === 'Director of Photography') ? crew.find(c => c.job === 'Director of Photography').name : 'Unknown',
      wrong: generateCrewOptions(),
      explanation: `The cinematographer is ${crew.find(c => c.job === 'Director of Photography') ? crew.find(c => c.job === 'Director of Photography').name : 'Unknown'}.`
    },
    {
      question: `What role does ${cast[3] ? cast[3].name : 'the fourth actor'} play?`,
      correct: cast[3] ? cast[3].character : 'Unknown',
      wrong: [cast[0]?.character, cast[1]?.character, cast[2]?.character].filter(Boolean),
      explanation: `${cast[3] ? cast[3].name : 'Unknown'} plays ${cast[3] ? cast[3].character : 'Unknown'}.`
    },
    {
      question: `Which production company made "${details.title}"?`,
      correct: details.production_companies[1] ? details.production_companies[1].name : (details.production_companies[0]?.name || 'Unknown'),
      wrong: generateCompanyOptions(),
      explanation: `One of the production companies was ${details.production_companies[1] ? details.production_companies[1].name : (details.production_companies[0]?.name || 'Unknown')}.`
    },
    {
      question: `What is the voter average for "${details.title}"?`,
      correct: details.vote_average ? `${details.vote_average.toFixed(1)}/10` : 'Unknown',
      wrong: generateRatingOptions(details.vote_average),
      explanation: `The average rating is ${details.vote_average ? details.vote_average.toFixed(1) + '/10' : 'Unknown'}.`
    },
    {
      question: `Who composed the music for "${details.title}"?`,
      correct: crew.find(c => c.job === 'Original Music Composer') ? crew.find(c => c.job === 'Original Music Composer').name : 'Unknown',
      wrong: ['Hans Zimmer', 'John Williams', 'Ennio Morricone'].filter(n => n !== crew.find(c => c.job === 'Original Music Composer')?.name),
      explanation: `The music was composed by ${crew.find(c => c.job === 'Original Music Composer') ? crew.find(c => c.job === 'Original Music Composer').name : 'Unknown'}.`
    }
  ],
  hard: [
    {
      question: `What was the budget for "${details.title}"?`,
      correct: details.budget ? `$${(details.budget / 1000000).toFixed(0)} million` : 'Unknown',
      wrong: generateBudgetOptions(details.budget),
      explanation: `The movie had a budget of ${details.budget ? '$' + (details.budget / 1000000).toFixed(0) + ' million' : 'Unknown'}.`
    },
    {
      question: `How much did "${details.title}" earn at the box office?`,
      correct: details.revenue ? `$${(details.revenue / 1000000).toFixed(0)} million` : 'Unknown',
      wrong: generateRevenueOptions(details.revenue),
      explanation: `The movie earned ${details.revenue ? '$' + (details.revenue / 1000000).toFixed(0) + ' million' : 'Unknown'} worldwide.`
    },
    {
      question: `Which production company primarily made "${details.title}"?`,
      correct: details.production_companies[0] ? details.production_companies[0].name : 'Unknown',
      wrong: generateCompanyOptions(),
      explanation: `It was produced by ${details.production_companies[0] ? details.production_companies[0].name : 'Unknown'}.`
    },
    {
      question: `What is the exact TMDB rating of "${details.title}"?`,
      correct: details.vote_average ? `${details.vote_average.toFixed(1)}/10` : 'Unknown',
      wrong: generateRatingOptions(details.vote_average),
      explanation: `The movie has a rating of ${details.vote_average ? details.vote_average.toFixed(1) + '/10' : 'Unknown'} on TMDB.`
    },
    {
      question: `In which country was "${details.title}" primarily produced?`,
      correct: details.production_countries[0] ? details.production_countries[0].name : 'Unknown',
      wrong: generateCountryOptions(),
      explanation: `The movie was produced in ${details.production_countries[0] ? details.production_countries[0].name : 'Unknown'}.`
    },
    {
      question: `What is the original title of "${details.title}"?`,
      correct: details.original_title,
      wrong: [details.title + ' Origins', 'The ' + details.title, details.title + ': The Beginning'],
      explanation: `The original title is "${details.original_title}".`
    },
    {
      question: `What is the production status of "${details.title}"?`,
      correct: details.status,
      wrong: ['In Production', 'Post Production', 'Planned'].filter(s => s !== details.status),
      explanation: `The production status is: ${details.status}.`
    },
    {
      question: `What is the profit margin of "${details.title}"?`,
      correct: details.revenue && details.budget ? `$${((details.revenue - details.budget) / 1000000).toFixed(0)} million profit` : 'Unknown',
      wrong: generateProfitOptions(details.revenue, details.budget),
      explanation: details.revenue && details.budget ? `The movie made a profit of $${((details.revenue - details.budget) / 1000000).toFixed(0)} million.` : 'Profit data unavailable.'
    },
    {
      question: `How many production companies worked on "${details.title}"?`,
      correct: details.production_companies ? `${details.production_companies.length} companies` : 'Unknown',
      wrong: generateCompanyCountOptions(details.production_companies?.length),
      explanation: `${details.production_companies ? details.production_companies.length : 'Unknown'} production companies were involved.`
    },
    {
      question: `What is the exact vote count for "${details.title}"?`,
      correct: details.vote_count ? `${details.vote_count.toLocaleString()} votes` : 'Unknown',
      wrong: generateExactVoteOptions(details.vote_count),
      explanation: `The movie has ${details.vote_count ? details.vote_count.toLocaleString() : 'Unknown'} votes on TMDB.`
    },
    {
      question: `Which country's flag appears in the production countries for "${details.title}"?`,
      correct: details.production_countries[1] ? details.production_countries[1].name : (details.production_countries[0]?.name || 'Unknown'),
      wrong: generateCountryOptions(),
      explanation: `${details.production_countries[1] ? details.production_countries[1].name : (details.production_countries[0]?.name || 'Unknown')} is one of the production countries.`
    },
    {
      question: `What is the homepage URL status of "${details.title}"?`,
      correct: details.homepage ? 'Has official website' : 'No official website',
      wrong: details.homepage ? ['No official website', 'Website under construction', 'Redirect only'] : ['Has official website', 'Multiple websites', 'Social media only'],
      explanation: details.homepage ? 'The movie has an official website.' : 'No official website exists.'
    },
    {
      question: `How many spoken languages are in "${details.title}"?`,
      correct: details.spoken_languages ? `${details.spoken_languages.length} language(s)` : 'Unknown',
      wrong: generateLanguageCountOptions(details.spoken_languages?.length),
      explanation: `The movie features ${details.spoken_languages ? details.spoken_languages.length : 'Unknown'} spoken language(s).`
    },
    {
      question: `What is the IMDb ID format for "${details.title}"?`,
      correct: details.imdb_id ? `Starts with ${details.imdb_id.substring(0, 4)}` : 'Unknown',
      wrong: ['Starts with tt12', 'Starts with tt98', 'Starts with tt45'],
      explanation: details.imdb_id ? `The IMDb ID is ${details.imdb_id}.` : 'IMDb ID unavailable.'
    },
    {
      question: `What percentage of voters gave "${details.title}" a high rating?`,
      correct: details.vote_average ? `${((details.vote_average / 10) * 100).toFixed(0)}% positive` : 'Unknown',
      wrong: generatePercentageOptions(details.vote_average),
      explanation: `Approximately ${details.vote_average ? ((details.vote_average / 10) * 100).toFixed(0) : 'Unknown'}% of voters rated it positively.`
    }
  ]
};
  
  // Get the appropriate difficulty pool
  const pool = questionBank[difficulty];
  
  // Shuffle the pool
  const shuffledPool = pool.sort(() => Math.random() - 0.5);
  
  // Select the requested number of questions
  const selectedQuestions = shuffledPool.slice(0, Math.min(count, pool.length));
  
  // Format questions with shuffled options
  selectedQuestions.forEach((q, index) => {
    const allOptions = [q.correct, ...q.wrong].filter(Boolean);
    const options = allOptions.sort(() => Math.random() - 0.5).slice(0, 4); // Ensure only 4 options
    const correctIndex = options.indexOf(q.correct);
    
    questions.push({
      question: q.question,
      options: options,
      correctIndex: correctIndex,
      explanation: q.explanation,
      image: images[index % images.length] 
        ? `https://image.tmdb.org/t/p/w500${images[index % images.length].file_path}`
        : (details.backdrop_path ? `https://image.tmdb.org/t/p/w500${details.backdrop_path}` : details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : '')
    });
  });
  
  return questions;
}

// For Vercel serverless functions
module.exports = app;

// For local development only
if (require.main === module) {
  app.listen(PORT,'0.0.0.0', () => {
    console.log(`🔥 UNIFIED Server - http://localhost:${PORT}`);
    console.log(`✅ Movies: TMDB Discovery with randomization`);
    console.log(`✅ Series: TMDB Discovery with randomization`);
    console.log(`✅ Music: TMDB Music Discovery with randomization`);
    console.log(`🧬 All use the SAME intelligent algorithm!`);
  });

}

