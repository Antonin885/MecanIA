const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://api.scrapingbee.com/v1';

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsAllTerms(text, terms) {
  const cleanText = normalize(text);
  return terms.every(term => cleanText.includes(term.toLowerCase()));
}

async function searchAmazonCA(query) {
  const terms = query.toLowerCase().split(/\s+/);
  const searchURL = `https://www.amazon.ca/s?k=${encodeURIComponent(query)}`;
  const results = [];

  try {
    // 🔍 Étape 1 — Recherche sur Amazon via ScrapingBee
    const { data: html } = await axios.get(BASE_URL, {
      params: {
        api_key: process.env.SCRAPINGBEE_API_KEY,
        url: searchURL,
        render_js: false,
      },
    });

    const $ = cheerio.load(html);

    $('div[data-asin]').each((_, el) => {
      const asin = $(el).attr('data-asin');
      const title = $(el).find('h2 span').text().trim();
      const image = $(el).find('img').attr('src');
      if (asin && title) {
        results.push({ asin, title, image });
      }
    });

    // 🔍 Étape 2 — Vérifie chaque page produit
    for (const product of results.slice(0, 10)) {
      const productURL = `https://www.amazon.ca/dp/${product.asin}`;
      const productPage = await axios.get(BASE_URL, {
        params: {
          api_key: process.env.SCRAPINGBEE_API_KEY,
          url: productURL,
          render_js: false,
        },
      });

      const pageText = normalize(productPage.data);

      if (containsAllTerms(pageText, terms)) {
        return {
          title: product.title,
          image: product.image,
          link: `https://www.amazon.ca/dp/${product.asin}?tag=${process.env.AMAZON_TAG}`,
          compatibility: 100,
        };
      }

      // Même si non parfait, on garde les infos
      results.push({ asin: product.asin, title: product.title, image: product.image });
    }

    // ❗ Si aucune correspondance parfaite, retourne quand même le 1er
    if (results.length > 0) {
      const first = results[0];
      return {
        title: first.title,
        image: first.image,
        link: `https://www.amazon.ca/dp/${first.asin}?tag=${process.env.AMAZON_TAG}`,
        compatibility: 60,
      };
    }

    // ❌ Aucun résultat
    return { title: null, image: null, link: null, compatibility: 0 };
  } catch (err) {
    console.error('❌ Erreur ScrapingBee/Amazon :', err.message || err);
    return { title: null, image: null, link: null, compatibility: 0 };
  }
}

module.exports = searchAmazonCA;
