const {app, BrowserWindow, ipcMain, ipcRenderer} = require('electron')
os = require('os')
fs = require('fs')
util = require('util')
uuidv4 = require('uuid/v4')



configPath = app.getPath('userData') + '/config.json'

function saveConfig() {
	fs.writeFileSync(configPath, JSON.stringify(global.config))
}

if (fs.existsSync(configPath)) {
	global.config = JSON.parse(fs.readFileSync(configPath))
} else {
	global.config = {
		serverid: uuidv4(),
		folders: [],
		clients: []
	}
	saveConfig()
}
console.log(global.config)



let mainWindow

function appReady() {
	mainWindow = new BrowserWindow({width: 800, height: 600})
	mainWindow.loadFile('index.html')

	//mainWindow.webContents.openDevTools()

	mainWindow.on('closed', () => mainWindow = null)
}

app.on('window-all-closed', () => app.quit())

app.on('ready', appReady)






function requestClient(req) {
	key = req.headers.authorization
	for (var client of global.config.clients) {
		if (client.key == key) {
			return client
		}
	}
	return null
}

function checkPath(path, client) {
	return path
}






function handleList(req,res) {
	if (client = requestClient(req)) {
		res.status(200).send('You are '+client.name+' and you want to list '+req.query.path)
	} else {
		res.status(401).send('Unauthorised')
	}
}

function handleFile(req,res) {
	if (client = requestClient(req)) {
		reqPath = req.query.path
		if (path = checkPath(reqPath,client)) {
			res.status(200).sendFile(path)
		} else {
			res.status(403).send('Unauthorised')
		}
	} else {
		res.status(401).send('Unauthorised')
	}
}




let offerWindow = null
let offerKey = null

ipcMain.on('offer', (event) => {
	if (offerWindow) {
		return
	}

	offerKey = uuidv4()
	offerBody = {'key':offerKey, 'addr': serverAddresses() }
	offerWindow = new BrowserWindow({width: 800, height: 600})
	offerWindow.loadFile('offer.html?body='+offerBody.stringify)

	offerWindow.on('closed', () => {
		offerWindow = null
		offerKey = null
	})
})



function handleClaim(req,res) {
	if (offerKey && req.headers.authorization == offerKey && req.query.name) {

		offerWindow.close()
		offerWindow = null
		offerKey = null

		newClient = {key: offeredKey, name: req.query.name}
		offeredKey = null
		global.config.clients.push(newClient)
		saveConfig()

		res.status(200).send('ok')
	} else {
		res.status(401).send('Unauthorised')
	}
}







let server = null

function startServer() {

	if (server) {
		return
	}

	server = require('./server')()

	server.server.get('/list', handleList)
	server.server.get('/file', handleFile)
	server.server.post('/claim', handleClaim)

	server.on('public-address-changed', serverStateChanged)
	server.on('started', serverStateChanged)
	serverStateChanged()
}

function stopServer() {
	if (server) {
		server.stop()
		server = null
		serverStateChanged()
	}
}

function serverStateChanged() {
	if (mainWindow) {
		mainWindow.send('server-state-change')
	}
}

startServer()


ipcMain.on('start-server', () => startServer())
ipcMain.on('stop-server', () => stopServer())
