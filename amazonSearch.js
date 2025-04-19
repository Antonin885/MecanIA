
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');

// ✅ Nettoie les textes
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ✅ Vérifie que tous les mots sont présents
function containsAllTerms(text, terms) {
  const cleanText = normalize(text);
  return terms.every(term => cleanText.includes(term.toLowerCase()));
}

// ✅ Scraping Amazon via Puppeteer avec fallback ScrapingBee
async function searchAmazonCA(query) {
  const terms = query.toLowerCase().split(/\s+/);
  const searchURL = `https://www.amazon.ca/s?k=${encodeURIComponent(query)}`;
  const results = [];

  try {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );
    await page.goto(searchURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const productCards = await page.$$('[data-asin]');
    for (const card of productCards.slice(0, 10)) {
      const asin = await card.evaluate(el => el.getAttribute('data-asin'));
      const title = await card.$eval('h2 span', el => el.textContent).catch(() => null);
      const image = await card.$eval('img', el => el.src).catch(() => null);

      if (!asin || !title) continue;

      const productURL = `https://www.amazon.ca/dp/${asin}`;
      const newPage = await browser.newPage();
      await newPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      );
      await newPage.goto(productURL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const bodyText = await newPage.evaluate(() => document.body.innerText);
      await newPage.close();

      if (containsAllTerms(bodyText, terms)) {
        await browser.close();
        return {
          title,
          image,
          link: `https://www.amazon.ca/dp/${asin}?tag=${process.env.AMAZON_TAG}`,
          compatibility: 100
        };
      }

      results.push({ asin, title, image });
    }

    await browser.close();

    if (results.length > 0) {
      const first = results[0];
      return {
        title: first.title,
        image: first.image,
        link: `https://www.amazon.ca/dp/${first.asin}?tag=${process.env.AMAZON_TAG}`,
        compatibility: 60
      };
    }

    // Si aucun produit via Puppeteer, tenter fallback ScrapingBee
    return await fallbackSearchAmazon(query, terms);
  } catch (err) {
    console.error('❌ Erreur Puppeteer/Amazon :', err.message || err);
    return await fallbackSearchAmazon(query, terms);
  }
}

// 🔁 Fallback ScrapingBee
async function fallbackSearchAmazon(query, terms) {
  const BASE_URL = 'https://api.scrapingbee.com/v1';
  const searchURL = `https://www.amazon.ca/s?k=${encodeURIComponent(query)}`;
  const results = [];

  try {
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

    for (const product of results.slice(0, 5)) {
      const productURL = `https://www.amazon.ca/dp/${product.asin}`;
      const page = await axios.get(BASE_URL, {
        params: {
          api_key: process.env.SCRAPINGBEE_API_KEY,
          url: productURL,
          render_js: false,
        },
      });

      const pageText = normalize(page.data);

      if (containsAllTerms(pageText, terms)) {
        return {
          title: product.title,
          image: product.image,
          link: `https://www.amazon.ca/dp/${product.asin}?tag=${process.env.AMAZON_TAG}`,
          compatibility: 100
        };
      }
    }

    if (results.length > 0) {
      const first = results[0];
      return {
        title: first.title,
        image: first.image,
        link: `https://www.amazon.ca/dp/${first.asin}?tag=${process.env.AMAZON_TAG}`,
        compatibility: 50
      };
    }

    return { title: null, image: null, link: null, compatibility: 0 };
  } catch (err) {
    console.error('❌ Erreur fallback ScrapingBee :', err.message || err);
    return { title: null, image: null, link: null, compatibility: 0 };
  }
}

module.exports = searchAmazonCA;
