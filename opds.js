sha1 = require('sha1')
XMLWriter = require('xml-writer')



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
		return ['urn','com.chunky-reader',global.config.serverid,'root'].join(':')
	} else {
		return ['urn','com.chunky-reader',global.config.serverid,kind,sha1(path)].join(':')
	}
}



module.exports = {

	navigationFeed: function(folder, subfolders) {
		//folder is null for root folder

		now = (new Date).toISOString()

		opds = new XMLWriter
		opds.startDocument()
		opds.startElement('feed').writeAttribute('xmlns', 'http://www.w3.org/2005/Atom')

		console.log(opdsID('nav'))
		opds.writeElement('id', opdsID('nav',folder))

		opds.startElement('link')
		opds.writeAttribute('href',opdsFoldersURL(null))
		opds.writeAttribute('rel','start')
		opds.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
		opds.endElement()

		opds.startElement('link')
		opds.writeAttribute('href',opdsFoldersURL(folder))
		opds.writeAttribute('rel','self')
		opds.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
		opds.endElement

		opds.writeElement('title', "ChunkyServer")
		opds.writeElement('updated', now)

		opds.startElement('author')
		opds.writeElement('name','ChunkyServer')
		opds.endElement()

		for (subfolder of subfolders) {
			stat = fs.statSync(subfolder)
			if (stat && stat.isDirectory()) {
				name = subfolder.split('/').slice(-1)[0]
				opds.startElement('entry')

				opds.writeElement('id', opdsID('nav',subfolder))
				opds.writeElement('title', name)
				opds.writeElement('updated', now)

				opds.startElement('link')
				opds.writeAttribute('href',opdsFoldersURL(subfolder))
				opds.writeAttribute('rel','subsection')
				opds.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
				opds.endElement

				opds.endElement()		//entry
			}
		}

		if (folder != null) {
			opds.startElement('entry')
			opds.writeElement('id', opdsID('acq',folder))
			opds.writeElement('title', 'Comics')
			opds.writeElement('updated', now)

			opds.startElement('link')
			opds.writeAttribute('href',opdsFoldersURL(folder))
			opds.writeAttribute('rel','subsection')
			opds.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=acquisition')
			opds.endElement

			opds.endElement()		//entry
		}

		opds.endElement()		//feed
		opds.endDocument()

		return opds.toString()
	},

	acquisitionFeed: function(folder, files) {

		now = (new Date).toISOString()

		opds = new XMLWriter
		opds.startDocument()
		opds.startElement('feed').writeAttribute('xmlns', 'http://www.w3.org/2005/Atom')

		opds.writeElement('id', opdsID('acq',folder))

		opds.startElement('link')
		opds.writeAttribute('href',opdsFoldersURL(null))
		opds.writeAttribute('rel','start')
		opds.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=navigation')
		opds.endElement()

		opds.startElement('link')
		opds.writeAttribute('href',opdsFilesURL(folder))
		opds.writeAttribute('rel','self')
		opds.writeAttribute('type','application/atom+xml;profile=opds-catalog;kind=acquisition')
		opds.endElement()

		opds.writeElement('title', "ChunkyServer")
		opds.writeElement('updated', now)

		opds.startElement('author')
		opds.writeElement('name','ChunkyServer')
		opds.endElement()

		for (file of files) {
			stat = fs.statSync(subfolder)
			if (stat && stat.isFile()) {
				name = file.split('/').slice(-1)[0]
				opds.startElement('entry')

				opds.writeElement('id', opdsID('acq',subfolder))
				opds.writeElement('title', name)
				opds.writeElement('updated', now)

				opds.startElement('link')
				opds.writeAttribute('href',opdsDownloadURL(file))
				opds.writeAttribute('rel','http://opds-spec.org/acquisition')
				opds.writeAttribute('type','application/epub+zip')
				opds.endElement

				opds.endElement()		//entry
			}
		}

		opds.endElement()		//feed
		opds.endDocument()

		return opds.toString()
	}
}
