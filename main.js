const {app, BrowserWindow, ipcMain, dialog} = require('electron')
os = require('os')
fs = require('fs')
util = require('util')
uuidv4 = require('uuid/v4')
opds = require('./opds')


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






function handleFolders(req,res) {
	if (client = requestClient(req)) {
		if (req.query.path == null) {
			roots = []
			for (folder of global.config.folders) {
				roots.push(folder.path)
			}
			console.log(opds)
			res.status(200).send(opds.navigationFeed(null, roots))
		} else if (path = checkPath(req.query.path)) {
			console.log(opds)
			fs.readdir(path, (err,files) => res.status(200).send(opds.navigationFeed(path, files)))
		} else {
			res.status(403).send('Unauthorised')
		}
	} else {
		res.status(401).send('Unauthorised')
	}
}

function handleFiles(req,res) {
	if (client = requestClient(req)) {
		if (path = checkPath(req.query.path)) {
			fs.readdir(path, (err,files) => res.status(200).send(opds.acquisitionFeed(path, files)))
		} else {
			res.status(403).send('Unauthorised')
		}
	} else {
		res.status(401).send('Unauthorised')
	}
}

function handleFile(req,res) {
	if (client = requestClient(req)) {
		if (path = checkPath(req.query.path,client)) {
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



function addFolder() {
	dialog.showOpenDialog(mainWindow, {
		title: 'Add folder',
		buttonLabel: 'Add',
		properties: ['openDirectory']
	}, (paths) => {
		if (paths && (paths.length == 1)) {
			//FIXME: Check for overlap with existing folders
			path = paths[0]
			name = path.split('/').slice(-1)[0]
			global.config.folders.push({path: path, name: name})
			saveConfig()
			foldersChanged()
		}
	})

}



ipcMain.on('offer', offer)
ipcMain.on('add-folder', addFolder)



function handleClaim(req,res) {
	console.log(req.headers)
	console.log(req.body)

	if (global.offerKey && req.headers.authorization == global.offerKey && req.body.name && req.body.id) {

		newClient = {key: global.offerKey, name: req.body.name, id: req.body.id}

		cancelOffer()

		global.config.clients.push(newClient)
		saveConfig()

		clientsChanged()

		res.status(200).send({name: os.hostname()})
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

function foldersChanged() {
	if (mainWindow) {
		mainWindow.send('update-folders')
	}
}


function startServer() {

	if (server) {
		return
	}

	server = require('./server')(12345)

	server.server.get('/folders', handleFolders)
	server.server.get('/files', handleFiles)
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
