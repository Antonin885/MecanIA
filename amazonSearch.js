const axios = require('axios');
const cheerio = require('cheerio');

// 🔍 Télécharge le texte complet de la page produit
async function fetchFullProductPageText(asin) {
  const url = `https://www.amazon.ca/dp/${asin}`;
  try {
    const { data } = await axios.get(url, { headers });
    const $ = cheerio.load(data);
    return $('body').text().replace(/\s+/g, ' ').toLowerCase();
  } catch (err) {
    console.error("❌ Erreur Amazon (page):", err.message);
    return '';
  }
}

function containsAllTerms(pageText, terms) {
  return terms.every(term => pageText.includes(term.toLowerCase()));
}

async function searchAmazonCA(query) {
  const parts = query.toLowerCase().split(/\s+/);
  const searchURL = `https://www.amazon.ca/s?k=${encodeURIComponent(query)}`;

  try {
    const { data } = await axios.get(searchURL, { headers });
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

    for (const product of products.slice(0, 10)) {
      const pageText = await fetchFullProductPageText(product.asin);
      if (containsAllTerms(pageText, parts)) {
        return {
          title: product.title,
          image: product.image,
          link: `https://www.amazon.ca/dp/${product.asin}?tag=${process.env.AMAZON_TAG}`,
          compatibility: 100
        };
      }
    }

    return { title: null, image: null, link: null, compatibility: 0 };
  } catch (err) {
    console.error("❌ Erreur Amazon (search):", err.message);
    return { title: null, image: null, link: null, compatibility: 0 };
  }
}

module.exports = searchAmazonCA;
