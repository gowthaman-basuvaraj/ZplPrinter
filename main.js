require('update-electron-app')()

const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const path = require("path")

if (require('electron-squirrel-startup')) return app.quit();
let win
const createWindow = () => {
    win = new BrowserWindow({
        width: 535,
        height: 768,
        frame: false,
        resizable: true,
        icon: __dirname + '/icons/512x512.png',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        }
    })

    win.loadFile('ZplPrinter/main.html')
    if(process.env.NODE_ENV === "development"){
        win.webContents.openDevTools()
    }
}

ipcMain.on('select-dirs', async (event, arg) => {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    })
    event.sender.send('selected-dirs', result.filePaths)

})

app.whenReady().then(() => {
    createWindow()
})
