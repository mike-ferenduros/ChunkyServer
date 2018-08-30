
const {app, BrowserWindow, ipcMain, dialog, Menu, Tray} = require('electron')
const os = require('os')
const fs = require('fs')
const util = require('util')
const uuidv4 = require('uuid/v4')
const basename = require('path').basename
const pathsep = require('path').sep
const pathjoin = require('path').join
const request = require('request')
const {autoUpdater} = require('electron-updater')
const opds = require('./opds')
const unarch = require('./unarch')


let server = null


const configPath = pathjoin(app.getPath('userData'),'config.json')

function saveConfig() {
	fs.writeFileSync(configPath, JSON.stringify(global.config))
}

global.defaultPort = 12300



let mainWindow = null
let tray = null
let trayMenu = null

function appReady() {
	tray = new Tray(__dirname+'/img/tray.png')
	tray.on('click', showMainWindow)
	tray.on('double-click', showMainWindow)
	trayMenu = Menu.buildFromTemplate([
		{ label: 'Open', click: showMainWindow },
		{ label: '', type: 'separator' },
		{ label: 'Start', click: startServer },
		{ label: 'Stop', click: stopServer },
		{ label: '', type: 'separator' },
		{ label: 'Quit', click: app.quit },
	])
	tray.setContextMenu(trayMenu)
	updateTray()

	if (fs.existsSync(configPath)) {
		global.config = JSON.parse(fs.readFileSync(configPath))
	} else {
		global.config = {
			cert: require('./cert').genCert(),
			folders: [],
			clients: []
		}
		saveConfig()
	}

	autoUpdater.checkForUpdatesAndNotify()

	startServer()

	showMainWindow()
}

function showMainWindow() {
	if (mainWindow) {
		mainWindow.show()
	} else {
		mainWindow = new BrowserWindow({width: 800, height: 600, resizable: false})
		mainWindow.loadFile('index.html')
		if (app.dock) {
			app.dock.show()
		}

// 	 	mainWindow.webContents.openDevTools()

		mainWindow.on('closed', () => {
			mainWindow = null
			if (app.dock) {
				app.dock.hide()
			}
		})
	}
}

let alreadyRunning = app.makeSingleInstance(showMainWindow)
if (alreadyRunning) {
	app.quit()
	return
}

app.on('window-all-closed', () => {})
app.on('ready', appReady)

app.on('will-quit', (event) => {
	if (server) {
		event.preventDefault()
		stopServer()
		setTimeout(app.quit, 3000)
	}
})

function updateTray() {
	var trayIcon
	if (server) {
		trayMenu.items[2].enabled = false
		trayMenu.items[3].enabled = true
		if (os.platform == 'win') {
			trayIcon = __dirname + '/img/tray-win.ico'
		} else {
			trayIcon = __dirname + '/img/tray.png'
		}

	} else {
		trayMenu.items[2].enabled = true
		trayMenu.items[3].enabled = false
		if (os.platform == 'win') {
			trayIcon = __dirname + '/img/tray-win-inactive.ico'
		} else {
			trayIcon = __dirname + '/img/tray-inactive.png'
		}
	}
	tray.setImage(trayIcon)
}


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
				if ((checked+pathsep).startsWith(folder.path+pathsep)) {
					return checked
				}
			}
		}
	}
	return null
}



let lastSentAddresses = null
let lastSentAddressesReceived = true
let lastSentAddressesTimeout = null

function updateServerAddresses(addresses) {
	global.serverAddresses = addresses

	let astring = JSON.stringify(addresses)
	if (astring == lastSentAddresses) {
		return
	}

	lastSentAddresses = astring
	console.log('Local addresses changed to '+addresses)

	if (lastSentAddressesTimeout) {
		clearTimeout(lastSentAddressesTimeout)
	}

	//Noone to update
	let keys = global.config.clients.map((c) => c.recordid || c.key)
	if (keys.length == 0) {
		serverStateChanged()
		lastSentAddressesReceived = true
		return
	}

	lastSentAddressesReceived = false
	lastSentAddressesTimeout = setTimeout(()=>{
		console.log('Sending address update')

		let req = {
			url: 'https://facetube.fish:20051/update',
			body: JSON.stringify({addresses: addresses, keys: keys}),
			headers: {'Content-Type':'application/json'},
			strictSSL: false
		}
		request.post(req, (err,resp,body) => {

			if (err) {
				console.log('Failed to deliver address update: ' + err)
			} else {
				console.log('Delivered address update -> '+body)
				//FIXME: Check response and prune client keys accordingly
				if (astring == lastSentAddresses) {
					lastSentAddressesReceived = true
				}
			}
			serverStateChanged()
		})
	}, addresses.length ? 2000 : 0)
	serverStateChanged()
}



function handleFolders(req,res) {
	let client = requestClient(req)
	if (client) {
		let path = checkPath(req.query.path)
		if (path) {
			fs.readdir(path, (err,files) => res.status(200).send(opds.navigationFeed(path, files)))
		} else if (req.query.path == null) {
			let roots = global.config.folders.map((folder) => folder.path)
			res.status(200).send(opds.navigationFeed(null, roots))
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

function handleCover(req,res) {
	let client = requestClient(req)
	if (client) {
		let path = checkPath(req.query.path,client)
		if (path) {
			unarch.openCoverStream(path, (err, stream) => {
				if (err) {
					res.status(500).send('Error extracting cover')
				} else {
					res.writeHead(200)

					stream.on('data', (data) => res.write(data))
					stream.on('end', () => res.end())
					stream.on('error', () => res.end())
				}
			})
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

	offerWindow = new BrowserWindow({width: 600, height: 300, resizable: false, frame: false})
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

function removeFolder(event, arg) {
	global.config.folders = global.config.folders.filter((folder) => folder.path != arg.path)
	saveConfig()
	foldersChanged()
}

function removeClient(event, arg) {
	global.config.clients = global.config.clients.filter((client) => client.key != arg.key)
	saveConfig()
	clientsChanged()
}

function toggleNat(event, enable) {
	console.log('toggleNat')
	global.config.nat = Boolean(enable)
	saveConfig()
	if (server) {
		server.updateNat()
	}
}

function setPort(event, port) {
	console.log('setPort ' + port)
	let p = Number(port)
	global.config.port = isNaN(p) ? null : p
	saveConfig()
}


ipcMain.on('offer', offer)
ipcMain.on('add-folder', addFolder)
ipcMain.on('remove-folder', removeFolder)
ipcMain.on('remove-client', removeClient)
ipcMain.on('toggle-nat', toggleNat)
ipcMain.on('set-port', setPort)



function handleClaim(req,res) {

	if (global.offerKey && req.headers.authorization == global.offerKey && req.body.name && req.body.id) {
		let client = null
		for (existing of global.config.clients) {
			if (existing.id == req.body.id) {
				client = existing
				break
			}
		}
		if (!client) {
			client = {id: req.body.id}
			global.config.clients.push(client)
		}

		client.key = global.offerKey
		client.name = req.body.name
		client.recordid = req.body.recordid || global.offerKey		//transitional - current clients will ALWAYS send recordid

		cancelOffer()

		saveConfig()

		clientsChanged()

		res.status(200).send({name: os.hostname(), fingerprint: global.config.cert.fingerprint})
	} else {
		res.status(401).send('Unauthorised')
	}
}

function handleAbout(req, res) {
	if (requestClient(req)) {
		res.status(200).send({version: app.getVersion(), protocol: 1})
	} else {
		res.status(401).send('Unauthorised')
	}
}


global.serverState = {
	running: false,
	status: 'stopped',
	addresses: [],
	dnsSent: false
}


function serverStateChanged() {
	let addresses = server ? server.addresses() : []
	addresses.sort()
	updateServerAddresses(addresses)

	global.serverState = {
		running: server != null,
		status: server ? 'running' : 'stopped',
		addresses: addresses.join(', '),
		dnsSent: lastSentAddressesReceived
	}

	if (mainWindow) {
		mainWindow.send('update-server')
	}
	if (offerWindow) {
		offerWindow.send('update-server')
	}

	updateTray()
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

	server = require('./server')(global.config.cert, global.config.port || global.defaultPort)

	server.server.get('/about', handleAbout)
	server.server.get('/folders', handleFolders)
	server.server.get('/files', handleFiles)
	server.server.get('/file', handleFile)
	server.server.get('/cover', handleCover)

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

function toggleServer() {
	if (server) {
		stopServer()
	} else {
		startServer()
	}
}

ipcMain.on('toggle-server', () => toggleServer())
