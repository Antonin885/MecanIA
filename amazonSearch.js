const axios = require('axios');
const cheerio = require('cheerio');

// 🔍 Télécharge le texte complet de la page produit
async function fetchFullProductPageText(asin) {
  const url = `https://www.amazon.ca/dp/${asin}`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-CA,en;q=0.9'
      }
    });
    const $ = cheerio.load(data);
    return $('body').text().replace(/\s+/g, ' ').toLowerCase();
  } catch {
    return '';
  }
}

// 🔢 Calcule le % de mots correspondants
function calculateMatchScore(pageText, terms) {
  let matches = 0;
  terms.forEach(term => {
    if (pageText.includes(term.toLowerCase())) matches++;
  });
  return Math.round((matches / terms.length) * 100);
}

// 🔍 Recherche sur Amazon Canada
async function searchAmazonCA(query) {
  const parts = query.toLowerCase().split(/\s+/);
  const searchURL = `https://www.amazon.ca/s?k=${encodeURIComponent(query)}`;

  try {
    const { data } = await axios.get(searchURL, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(data);
    const products = [];

    $('div[data-asin]').each((_, el) => {
      const asin = $(el).attr('data-asin');
      const title = $(el).find('h2 span').text().trim();
      const image = $(el).find('img').attr('src');
      if (asin && title) {
        products.push({ asin, title, image });
      }
    });

    let bestMatch = null;
    let bestScore = 0;

    for (const product of products.slice(0, 10)) {
      const pageText = await fetchFullProductPageText(product.asin);
      const score = calculateMatchScore(pageText, parts);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    if (bestMatch && bestScore >= 60) { // ✅ 60% minimum de compatibilité
      return {
        title: bestMatch.title,
        image: bestMatch.image,
        link: `https://www.amazon.ca/dp/${bestMatch.asin}?tag=${process.env.AMAZON_TAG}`,
        compatibility: bestScore
      };
    }

    return { title: null, image: null, link: null, compatibility: 0 };
  } catch (err) {
    console.error("❌ Erreur Amazon :", err.message);
    return { title: null, image: null, link: null, compatibility: 0 };
  }
}

module.exports = searchAmazonCA;
