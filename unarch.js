const yauzl = require('yauzl')
const natcom = require('string-natural-compare')
const extname = require('path').extname



const imageExtensions = ['.tga', '.png', '.jpg', '.bmp', '.tiff', '.jpe', '.gif', '.tif', '.j2k', '.jpeg']

function isImageName(name) {
	return (name.slice(-1) != '/') && imageExtensions.includes(extname(name).toLowerCase())
}



const punct = '!"#$%&\'()*+,-./:;<=>?`{|}~'

function pageCompare(s0,s1) {
	let p0 = punct.includes(s0[0])
	let p1 = punct.includes(s1[0])

	//Force punctuation to always sort above non-punctuation
	if (p0 && !p1) {
		return 1
	} else if (!p0 && p1) {
		return -1
	} else {
		return natcom(s0,s1)
	}
}



module.exports = {
	openCoverStream: function(path, cb) {
		this.openCoverStreamZip(path, (err, stream) => {
			if (err == "nocover" || err == null) {
				//Either succeeded, or didn't find a cover but is still a valid zip
				cb(err, stream)
			} else {
				//Failed to open zip, try rar
				this.openCoverStreamRar(path, cb)
			}
		})
	},



	openCoverStreamZip: function(path, cb) {
		yauzl.open(path, {autoClose: false}, (err,zip) => {
			if (err) return cb(err);

			let cover = null

			zip.on('entry', (entry) => {
				if (isImageName(entry.fileName)) {
					if (!cover || pageCompare(entry.fileName, cover.fileName) < 0) {
						cover = entry
					}
				}
			})

			zip.on('end', () => {
				if (cover) {
					zip.openReadStream(cover, cb)
				} else {
					cb('nocover')
				}
				zip.close()
			})
		})
	},

	openCoverStreamRar: function(path, cb) {
		cb("RAR not yet implemented")
	}
}
