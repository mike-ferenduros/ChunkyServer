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

		xml = new XMLWriter
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

		xml.writeElement('title', "ChunkyServer")
		xml.writeElement('updated', now)

		xml.startElement('author')
		xml.writeElement('name','ChunkyServer')
		xml.endElement()

		for (name of subfolders) {
			subfolder = [folder,name].join('/')
			stat = fs.statSync(subfolder)
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

		now = (new Date).toISOString()

		xml = new XMLWriter
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

		xml.writeElement('title', "ChunkyServer")
		xml.writeElement('updated', now)

		xml.startElement('author')
		xml.writeElement('name','ChunkyServer')
		xml.endElement()

		for (name of files) {
			file = [folder,name].join('/')
			stat = fs.statSync(file)
			if (stat && stat.isFile()) {
				xml.startElement('entry')

				xml.writeElement('id', opdsID('file',file))
				xml.writeElement('title', name)
				xml.writeElement('updated', now)

				xml.startElement('link')
				xml.writeAttribute('href',opdsDownloadURL(file))
				xml.writeAttribute('rel','http://opds-spec.org/acquisition')
				xml.writeAttribute('type','application/epub+zip')
				xml.endElement()

				xml.endElement()		//entry
			}
		}

		xml.endElement()		//feed
		xml.endDocument()

		return xml.toString()
	}
}
