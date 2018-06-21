const yauzl = require('yauzl')
const natcom = require('string-natural-compare')
const extname = require('path').extname
const fs = require('fs')
const execFile = require('child_process').execFile
const os = require('os')
const pathjoin = require('path').join
const pathparse = require('path').parse
const tmp = require('tmp')

const imageExtensions = ['.tga', '.png', '.jpg', '.bmp', '.tiff', '.jpe', '.gif', '.tif', '.j2k', '.jpeg']

function isImageName(name) {
	return (name.slice(-1) != '/') && imageExtensions.includes(extname(name).toLowerCase())
}



let unrar = null
if (process.platform == 'darwin') {
	unrar = pathjoin(process.cwd(), 'bin/unrar_MacOSX_10.13.2_64bit')
} else if (process.platform == 'win32') {
	unrar = pathjoin(process.cwd(), 'bin\\unrarw32.exe')
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

	openCoverStreamRar: function(rarpath, cb) {
		if (!unrar) return cb('Unsupported OS')

		execFile(unrar, ['lb', rarpath], (err, sout, serr) => {
			if (err) return cb(err)

			let contents = sout.split('\n').filter((line) => isImageName(line)).sort(pageCompare)
			if (contents.length == 0) return cb("nopages")
			let page = contents[0]

			let tmpdir = tmp.dirSync()
//			console.log(`unrar: ${rarpath} , ${page}`)
			execFile(unrar, ['e', rarpath, page], {cwd: tmpdir.name}, (err, sout, serr) => {
				if (err) {
//					console.log(`failed: ${err}`)
					tmpdir.removeCallback()
					return cb(err)
				}

				let src = pathjoin(tmpdir.name, pathparse(page).base)
				let dest = tmp.tmpNameSync()
//				console.log(`Rename: ${src} -> ${dest}`)
				fs.rename(src, dest, (err) => {
					tmpdir.removeCallback()
					if (err) {
//						console.log(`Rename failed ${err}`)
						fs.unlink(src, (err)=>{})
						return cb(err)
					}

					stream = fs.createReadStream(dest)
					stream.on('close', () => fs.unlink(dest, (err)=>{}))
					return cb(null, stream)
				})
			})
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
	}
}
