const {app, BrowserWindow, ipcMain, dialog} = require('electron')
let os = require('os')
let fs = require('fs')
let util = require('util')
let uuidv4 = require('uuid/v4')
let opds = require('./opds')
let basename = require('path').basename


let server = null


let configPath = app.getPath('userData') + '/config.json'

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
	let key = req.headers.authorization
	if (key) {
		for (let client of global.config.clients) {
			if (client.key == key) {
				return client
			}
		}
	}
	return null
}

function checkPath(path, client) {
	if (path) {
		let checked = fs.realpathSync(path)
		if (checked) {
			for (let folder of global.config.folders) {
				if ((checked+'/').startsWith(folder.path+'/')) {
					return path
				}
			}
		}
	}
	return null
}



let lastSentAddresses = null

function updateServerAddresses(addresses) {
	global.serverAddresses = addresses

	let astring = JSON.stringify(addresses)
	if (astring != lastSentAddresses) {
		lastSentAddresses = astring
		console.log('Local addresses changed to '+addresses)
	}
}





function handleFolders(req,res) {
	let client = requestClient(req)
	if (client) {
		if (req.query.path == null) {
			let roots = global.config.folders.map((folder) => folder.path)
			res.status(200).send(opds.navigationFeed(null, roots))
		} else if (path = checkPath(req.query.path)) {
			fs.readdir(path, (err,files) => res.status(200).send(opds.navigationFeed(path, files)))
		} else {
			res.status(403).send('Unauthorised')
		}
	} else {
		res.status(401).send('Unauthorised')
	}
}

function handleFiles(req,res) {
	let client = requestClient(req)
	if (client) {
		let path = checkPath(req.query.path)
		if (path) {
			fs.readdir(path, (err,files) => res.status(200).send(opds.acquisitionFeed(path, files)))
		} else {
			res.status(403).send('Unauthorised')
		}
	} else {
		res.status(401).send('Unauthorised')
	}
}

function handleFile(req,res) {
	let client = requestClient(req)
	if (client) {
		let path = checkPath(req.query.path,client)
		if (path) {
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
			let path = fs.realpathSync(paths[0])
			if (path) {
				global.config.folders.push({path: path, name: basename(path)})
				saveConfig()
				foldersChanged()
			}
		}
	})
}



ipcMain.on('offer', offer)
ipcMain.on('add-folder', addFolder)



function handleClaim(req,res) {

	if (global.offerKey && req.headers.authorization == global.offerKey && req.body.name && req.body.id) {

		let newClient = {key: global.offerKey, name: req.body.name, id: req.body.id}

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
	let addresses = server ? server.addresses() : []
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
