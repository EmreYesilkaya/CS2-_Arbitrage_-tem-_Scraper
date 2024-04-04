const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

// Use the stealth plugin to evade detection
puppeteer.use(StealthPlugin());

// Telegram bot setup
const token = '7141138826:AAFC4xYdSA2_tUOSdphphCzwVnxk57sMNzk'; // Replace with your actual Telegram bot token
const chatId = '1066322129'; // Replace with your actual chat ID
const bot = new TelegramBot(token, { polling: true });

const sendMessageToTelegram = (message) => {
  bot.sendMessage(chatId, message).catch(error => console.log(error));
};

// Function to initialize or reset the log stream
let logStream;
const resetLogStream = () => {
  if (logStream) logStream.end(); // Close existing stream if open
  logStream = fs.createWriteStream('log.txt', { flags: 'a' }); // Open a new stream
};
resetLogStream(); // Initialize the stream for the first time
setInterval(resetLogStream, 2 * 60 * 1000); // Reset log stream every 2 minutes

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const startTime = new Date();
  const duration = 600 * 60 * 1000; // 10 hours in milliseconds
  const reloadInterval = 60 * 1000; // 1 minute in milliseconds
  let loggedItems = {};

  const usdExchangeRate = 32;
  setInterval(() => sendMessageToTelegram('The script is running...'), 1 * 60 * 1000);
  const log = (message, itemName, priceDifferencePercentage, priceDifference, apiPriceUSD) => {
    if (!loggedItems[itemName] && apiPriceUSD !== null) { // Ensure item is not logged before and API price is not null
      console.log(message);
      logStream.write(`${message}\n`);
      loggedItems[itemName] = true; // Mark the item to prevent it from being logged again

      // Send a message on Telegram if the price difference percentage is more than -5%
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

  const findItemInApiPrices = (apiPrices, itemName) => {
    const entries = Object.entries(apiPrices.items);
    for (let [key, value] of entries) {
      if (value.market_hash_name === itemName) {
        return value;
      }
    }
    return null;
  };

  // Fetch item prices from the API at the start
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
      const priceUSD = priceTL / usdExchangeRate;

      const apiItem = findItemInApiPrices(apiPrices, itemName);
      const apiPriceUSD = apiItem ? parseFloat(apiItem.price) : null;

      if (!loggedItems[itemName]) {
        const priceDifference = apiPriceUSD ? apiPriceUSD - priceUSD : null;
        const priceDifferencePercentage = priceDifference !== null ? ((priceDifference / priceUSD) * 100) : null; // Calculate the percentage difference if apiPriceUSD is not null
        const message = `Item name: ${itemName}, scraped price (USD): ${priceUSD.toFixed(2)}, API price (USD): ${apiPriceUSD ? apiPriceUSD.toFixed(2) : 'not found'}, difference: ${priceDifference ? priceDifference.toFixed(2) : 'N/A'}, difference percentage: ${priceDifferencePercentage ? priceDifferencePercentage.toFixed(2) : 'N/A'}%. Link: ${itemLink}`;
        log(message, itemName, priceDifferencePercentage, priceDifference, apiPriceUSD);
      }
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, reloadInterval));
  }

  await browser.close();
  logStream.end();
})();
