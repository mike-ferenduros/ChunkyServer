let sha1 = require('sha1')
let fs = require('fs')
let XMLWriter = require('xml-writer')
let extname = require('path').extname
let joinpath = require('path').join
let basename = require('path').basename



function opdsFoldersURL(folder) {
	if (folder == null) {
		return '/folders'
	} else {
		return '/folders?path='+encodeURIComponent(folder)
	}
}

function opdsFilesURL(folder) {
	return '/files?path='+encodeURIComponent(folder)
}

function opdsDownloadURL(path) {
	return '/file?path='+encodeURIComponent(path)
}

function opdsID(kind,path) {
	if (path == null) {
		return ['urn','chunkyserver',global.config.serverid,'root'].join(':')
	} else {
		return ['urn','chunkyserver',global.config.serverid,kind,sha1(path)].join(':')
	}
}



let mimetypes = {
	'.zip': 'application/vnd.comicbook+zip',
	'.cbz': 'application/vnd.comicbook+zip',
	'.cbr': 'application/vnd.comicbook-rar',
	'.rar': 'application/vnd.comicbook-rar',
	'.cb7': 'application/x-7z-compressed',
	'.cbt': 'application/tar',
	'.pdf': 'application/pdf'
}

module.exports = {

	navigationFeed: function(folder, subfolders) {
		//folder is null for root folder

		let now = (new Date).toISOString()

		let xml = new XMLWriter
		xml.startDocument()
		xml.startElement('feed').writeAttribute('xmlns', 'http://www.w3.org/2005/Atom')

		console.log(opdsID('nav'))
		xml.writeElement('id', opdsID('nav',folder))

		xml.startElement('link')
		xml.writeAttribute('href',opdsFoldersURL(null))
		xml.writeAttribute('rel','start')
		xml.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
		xml.endElement()

		xml.startElement('link')
		xml.writeAttribute('href',opdsFoldersURL(folder))
		xml.writeAttribute('rel','self')
		xml.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
		xml.endElement()

		if (folder) {
			xml.writeElement('title', basename(folder))
		} else {
			xml.writeElement('title', 'ChunkyServer')
		}

		xml.writeElement('updated', now)

		xml.startElement('author')
		xml.writeElement('name','ChunkyServer')
		xml.endElement()

		for (let name of subfolders) {

			let subfolder
			if (folder) {
				subfolder = joinpath(folder,name)
			} else {
				subfolder = name
				name = basename(subfolder)
			}

			try {
				let stat = fs.statSync(subfolder)
				if (stat && stat.isDirectory()) {
					xml.startElement('entry')

					xml.writeElement('id', opdsID('nav',subfolder))
					xml.writeElement('title', name)
					xml.writeElement('updated', now)

					xml.startElement('link')
					xml.writeAttribute('href',opdsFoldersURL(subfolder))
					xml.writeAttribute('rel','subsection')
					xml.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
					xml.endElement()

					xml.endElement()		//entry
				}
			} catch (e) {
				console.log('Failed to stat '+subfolder+': '+e)
			}
		}

		if (folder != null) {
			xml.startElement('entry')
			xml.writeElement('id', opdsID('acq',folder))
			xml.writeElement('title', 'Comics')
			xml.writeElement('updated', now)

			xml.startElement('link')
			xml.writeAttribute('href',opdsFilesURL(folder))
			xml.writeAttribute('rel','subsection')
			xml.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=acquisition')
			xml.endElement()

			xml.endElement()		//entry
		}

		xml.endElement()		//feed
		xml.endDocument()

		return xml.toString()
	},

	acquisitionFeed: function(folder, files) {

		let now = (new Date).toISOString()

		let xml = new XMLWriter
		xml.startDocument()
		xml.startElement('feed').writeAttribute('xmlns', 'http://www.w3.org/2005/Atom')

		xml.writeElement('id', opdsID('acq',folder))

		xml.startElement('link')
		xml.writeAttribute('href',opdsFoldersURL(null))
		xml.writeAttribute('rel','start')
		xml.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
		xml.endElement()

		xml.startElement('link')
		xml.writeAttribute('href',opdsFilesURL(folder))
		xml.writeAttribute('rel','self')
		xml.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=acquisition')
		xml.endElement()

		xml.writeElement('title', basename(folder))
		xml.writeElement('updated', now)

		xml.startElement('author')
		xml.writeElement('name','ChunkyServer')
		xml.endElement()

		for (let name of files) {
			let mimetype = mimetypes[extname(name)]
			if (mimetype) {
				let file = joinpath(folder,name)
				try {
					let stat = fs.statSync(file)
					if (stat && stat.isFile()) {
						xml.startElement('entry')

						xml.writeElement('id', opdsID('file',file))
						xml.writeElement('title', name)
						xml.writeElement('updated', now)

						xml.startElement('link')
						xml.writeAttribute('href',opdsDownloadURL(file))
						xml.writeAttribute('rel','http://opds-spec.org/acquisition')
						xml.writeAttribute('type', mimetype)
						xml.endElement()

						xml.endElement()		//entry
					}
				} catch (e) {
					console.log('Failed to stat '+file+': '+e)
				}
			}
		}

		xml.endElement()		//feed
		xml.endDocument()

		return xml.toString()
	}
}
