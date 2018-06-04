const {app, BrowserWindow, ipcMain} = require('electron')
os = require('os')
fs = require('fs')
util = require('util')
uuidv4 = require('uuid/v4')


let server = null


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

	mainWindow.webContents.openDevTools()

	mainWindow.on('closed', () => mainWindow = null)
}

app.on('window-all-closed', () => app.quit())

app.on('ready', appReady)



function sendUpdateServer(dest) {
	dest.send('update-server', {'status': 'whatevs'})
}




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



let lastSentAddresses = null

function updateServerAddresses(addresses) {
	global.serverAddresses = addresses

	astring = JSON.stringify(addresses)
	if (astring != lastSentAddresses) {
		lastSentAddresses = astring
		console.log('Local addresses changed to '+addresses)
	}
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

function offer() {
	if (offerWindow) {
		offerWindow.focus()
		return
	}
	if (!server) {
		return
	}
	global.offerKey = uuidv4()

	offerWindow = new BrowserWindow({width: 800, height: 600})
	offerWindow.loadFile('offer.html')

	offerWindow.on('closed', () => {
		offerWindow = null
		global.offerKey = null
	})
}

function cancelOffer() {
	if (offerWindow) {
		offerWindow.close()
		offerWindow = null
	}
	global.offerKey = null
}


ipcMain.on('offer', offer)



function handleClaim(req,res) {
	console.log(req.headers)
	console.log(req.body)

	if (global.offerKey && req.headers.authorization == global.offerKey && req.body.name && req.body.id) {

		newClient = {key: global.offerKey, name: req.body.name, id: req.body.id}

		cancelOffer()

		global.config.clients.push(newClient)
		saveConfig()

		clientsChanged()

		res.status(200).send('ok')
	} else {
		res.status(401).send('Unauthorised')
	}
}





function serverStateChanged() {
	addresses = server ? server.addresses() : []
	addresses.sort()
	updateServerAddresses(addresses)

	global.serverState = {
		running: server != null,
		status: server ? 'running' : 'stopped',
		natStatus: addresses.join(', ')
	}

	if (mainWindow) {
		mainWindow.send('update-server')
	}
	if (offerWindow) {
		offerWindow.send('update-server')
	}
}

function clientsChanged() {
	if (mainWindow) {
		mainWindow.send('update-clients')
	}
}


function startServer() {

	if (server) {
		return
	}

	server = require('./server')(12345)

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

	cancelOffer()
}

startServer()


ipcMain.on('start-server', () => startServer())
ipcMain.on('stop-server', () => stopServer())
