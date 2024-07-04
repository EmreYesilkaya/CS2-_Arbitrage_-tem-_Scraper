const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

puppeteer.use(StealthPlugin());

const token = '7141138826:AAFC4xYdSA2_tUOSdphphCzwVnxk57sMNzk';
const chatId = '1066322129';
const bot = new TelegramBot(token, { polling: true });

const sendMessageToTelegram = (message) => {
  bot.sendMessage(chatId, message).catch(error => console.log(error));
};

const handleExit = () => {
  console.log('Exiting...');
  process.exit();
};

process.on('SIGINT', handleExit).on('SIGTERM', handleExit);
process.on('exit', handleExit).on('uncaughtException', handleExit);

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const startTime = new Date();
  const duration = 60000 * 60 * 1000;
  const reloadInterval = 60 * 1000;
  let loggedItems = {};

  setInterval(() => sendMessageToTelegram('The script is running...'), 61 * 60 * 1000);

  const log = (message, itemName, priceDifferencePercentage, priceDifference, apiPriceUSD) => {
    if (!loggedItems[itemName] && apiPriceUSD !== null) {
      console.log(message);
      loggedItems[itemName] = true;

      if (priceDifferencePercentage > -3) {
        sendMessageToTelegram(message);
      }
    }
  };

  const fetchItemPrices = () => {
    return new Promise((resolve, reject) => {
      https.get('https://market.csgo.com/api/v2/prices/orders/USD.json', (resp) => {
        let data = '';
        resp.on('data', (chunk) => {
          data += chunk;
        });
        resp.on('end', () => {
          try {
            const prices = JSON.parse(data);
            resolve(prices);
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", (err) => {
        reject(err);
      });
    });
  };

  const apiPrices = await fetchItemPrices();

  while (new Date() - startTime < duration) {
    await page.goto('https://www.bynogame.com/tr/oyunlar/csgo/skin-last?size=100', { waitUntil: 'networkidle0', timeout: 60000 });

    const itemCards = await page.$$('.h-100.itemCard.ping');
    for (let itemCard of itemCards) {
      const itemName = await itemCard.evaluate(el => el.querySelector('.itemCard__info h2')?.textContent.trim());
      const itemLink = await itemCard.evaluate(el => el.querySelector('a').href);
      const priceTL = await itemCard.evaluate(el => {
        const priceElement = el.querySelector('.font-weight-bolder.mb-0.text-black');
        return priceElement ? parseFloat(priceElement.textContent.trim().replace('.', '').replace(',', '.')) : null;
      });
      const usdExchangeRate = 32;
      const priceUSD = priceTL / usdExchangeRate;

      const apiItem = apiPrices.items.find(item => item.market_hash_name === itemName);
      const apiPriceUSD = apiItem ? parseFloat(apiItem.price) : null;

      if (!loggedItems[itemName]) {
        const priceDifference = apiPriceUSD ? apiPriceUSD - priceUSD : null;
        const priceDifferencePercentage = priceDifference !== null ? ((priceDifference / priceUSD) * 100) : null;
        const message = `Item name: ${itemName}, scraped price (USD): ${priceUSD.toFixed(2)}, API price (USD): ${apiPriceUSD ? apiPriceUSD.toFixed(2) : 'not found'}, difference: ${priceDifference ? priceDifference.toFixed(2) : 'N/A'}, difference percentage: ${priceDifferencePercentage ? priceDifferencePercentage.toFixed(2) : 'N/A'}%. Link: ${itemLink}`;
        log(message, itemName, priceDifferencePercentage, priceDifference, apiPriceUSD);
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, reloadInterval));
  }

  await browser.close();
})();
