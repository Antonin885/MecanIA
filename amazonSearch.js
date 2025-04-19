const puppeteer = require('puppeteer');

// ✅ Nettoie les textes
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ✅ Vérifie que tous les mots sont présents
function containsAllTerms(pageText, terms) {
  return terms.every(term => normalize(pageText).includes(term.toLowerCase()));
}

// ✅ Lance une recherche Amazon et récupère les résultats
async function searchAmazonCA(query) {
  const terms = query.toLowerCase().split(/\s+/);
  const searchURL = `https://www.amazon.ca/s?k=${encodeURIComponent(query)}`;
  const results = [];

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );

    console.log('Navigating to:', searchURL);
    await page.goto(searchURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const productCards = await page.$$('[data-asin]');
    console.log('Product Cards:', productCards.length);

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

    return { title: null, image: null, link: null, compatibility: 0 };
  } catch (err) {
    console.error('❌ Erreur Puppeteer/Amazon :', err.message || err);
    if (browser) await browser.close();
    return { title: null, image: null, link: null, compatibility: 0 };
  }
}

module.exports = searchAmazonCA;
