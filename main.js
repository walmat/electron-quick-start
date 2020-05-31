const {app, BrowserWindow} = require('electron')
const path = require('path')
const { jar } = require('request');

const { request } = require('./request');

async function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  const response = await request({
    url: 'https://undefeated.com/account/login',
    proxy: '127.0.0.1:8888',
    method: 'POST',
    followAllRedirects: true,
    followRedirect: true,
    timeout: 15000,
    jar: jar(),
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Safari/537.36',
      origin: 'https://undefeated.com',
      'content-type': 'application/x-www-form-urlencoded'
    },
    form: {
      form_type: 'customer_login',
      utf8: '✓',
      'customer[email]': 'example123@gmail.com',
      'customer[password]': 'example123'
    },
  });

  // NOTE: `set-cookie` headers are present here, but are incorrect since they aren't carried through the redirects
  console.log(response.headers);
}

app.whenReady().then(() => {
  createWindow()
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})