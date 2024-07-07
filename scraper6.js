const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');

puppeteer.use(StealthPlugin());

const token = '7141138826:AAFC4xYdSA2_tUOSdphphCzwVnxk57sMNzk';
const chatId = '1066322129';
const bot = new TelegramBot(token, { polling: true });

const sendMessageToTelegram = (message) => {
  bot.sendMessage(chatId, message, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(error => console.log(error));
};

const handleExit = () => {
  console.log('Exiting...');
  process.exit();
};

process.on('SIGINT', handleExit).on('SIGTERM', handleExit);
process.on('exit', handleExit).on('uncaughtException', handleExit);

const USD_TRY_RATE = 32.62; // Sabit döviz kuru

const fetchItemPrices = async () => {
  try {
    const response = await fetch('https://market.csgo.com/api/v2/prices/orders/USD.json');
    const prices = await response.json();
    console.log('API fiyatları başarıyla alındı.');
    return prices;
  } catch (error) {
    console.log('API fiyatlarını alırken hata oluştu:', error);
    return null;
  }
};

(async () => {
  console.log('Puppeteer başlatılıyor...');
  const browser = await puppeteer.launch({ headless: "new" });
  console.log('Browser açıldı.');
  const page = await browser.newPage();
  console.log('Yeni sayfa oluşturuldu.');
  const startTime = new Date();
  const duration = 60000 * 60 * 1000;
  const reloadInterval = 30 * 1000; // 30 saniye
  let loggedItems = {};

  setInterval(() => sendMessageToTelegram('The script is running...'), 30 * 60 * 1000);

  const log = (message, itemName, priceDifferencePercentage) => {
    if (!loggedItems[itemName]) {
      console.log(message);
      loggedItems[itemName] = true;

      if (priceDifferencePercentage > -1) {
        sendMessageToTelegram(message);
      }
    }
  };

  while (new Date() - startTime < duration) {
    try {
      const apiPrices = await fetchItemPrices();
      
      if (!apiPrices) {
        throw new Error('API fiyatları alınamadı. Yeniden deneniyor...');
      }
      
      console.log('Sayfaya gidiliyor...');
      await page.goto('https://www.bynogame.com/tr/oyunlar/csgo/skin-last?size=100', { waitUntil: 'networkidle0', timeout: 60000 });
      console.log('Sayfaya gidildi ve yüklendi.');

      const itemCards = await page.$$('.h-100.itemCard.ping');
      for (let itemCard of itemCards) {
        const itemName = await itemCard.evaluate(el => el.querySelector('.itemCard__info h2')?.textContent.trim());
        const itemLink = await itemCard.evaluate(el => el.querySelector('a').href);
        const priceTL = await itemCard.evaluate(el => {
          const priceElement = el.querySelector('.font-weight-bolder.mb-0.text-black');
          return priceElement ? parseFloat(priceElement.textContent.trim().replace('.', '').replace(',', '.')) : null;
        });
        
        if (priceTL === null) continue; // Fiyat alınamazsa bu ürünü atla
        
        const priceUSD = priceTL / USD_TRY_RATE;

        const apiItem = apiPrices.items.find(item => item.market_hash_name === itemName);
        const apiPriceUSD = apiItem ? parseFloat(apiItem.price) : null;

        if (apiPriceUSD !== null) {
          const priceDifference = apiPriceUSD - priceUSD;
          const priceDifferencePercentage = (priceDifference / priceUSD) * 100;
          
          const message = `
<b>${itemName}</b>
ByNoGame Price (USD): <b>${priceUSD.toFixed(2)}</b>
CS:GO Market Price (USD): <b>${apiPriceUSD.toFixed(2)}</b>
Difference: <b>${priceDifference.toFixed(2)}</b>
Difference percentage: <b>${priceDifferencePercentage.toFixed(2)}%</b>
ByNoGame Link: <a href="${itemLink}">ByNoGame</a>
CS:GO Market Link: <a href="https://market.csgo.com/en/item/${encodeURIComponent(itemName)}">CS:GO Market</a>`;

          log(message, itemName, priceDifferencePercentage);
        }
      }

      console.log('Bekleniyor...');
      await new Promise(resolve => setTimeout(resolve, reloadInterval));
    } catch (error) {
      console.error('Bir hata oluştu:', error);
      await new Promise(resolve => setTimeout(resolve, 60000)); // Hata durumunda 1 dakika bekle
    }
  }

  await browser.close();
  console.log('Browser kapatıldı.');
})();
