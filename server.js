os = require('os')
fs = require('fs')
util = require('util')
uuidv4 = require('uuid/v4')
express = require('express')
upnp = require('nat-upnp')

EventEmitter = require('events')
util.inherits(Server, EventEmitter)

module.exports = function(port, ttl) {
	return new Server(port, ttl)
}



function Server(port, ttl) {
	EventEmitter.call(this)

	this.server = express()

	this.ttl = ttl || 600
	this.privatePort = null
	this.publicPort = null
	this.publicIP = null
	this.running = true

	this.listener = this.server.listen(port || 0, () => {
		if (!this.running) {
			return
		}

		this.privatePort = this.listener.address().port

		this.upnp = upnp.createClient()
		this.refreshPublicIP()
		this.refreshMapping()

		this.emit('started')
		console.log('Listening on port '+this.privatePort)
	})
}

Server.prototype.stop = function() {
	this.setMappingTimeout(null)

	if(this.listener) {
		console.log('Stopping listener')
		this.listener.close()
		this.listener = null
	}

	this.getMapping((err,mapping) => {
		if (mapping) {
			this.upnp.portUnmapping({public: mapping.public.port})
			console.log('Killing mapping at public port '+mapping.public.port)
		}
	})

	this.running = false
}

Server.prototype.refreshPublicIP = function() {
	if (!this.running) {
		return
	}
	this.upnp.externalIp((err,ip) => {
		if (ip) {
			this.setPublicIP(ip)
		}
	})
}

Server.prototype.getMapping = function(cb) {
	this.upnp.getMappings((err, mappings) => {
		if (mappings) {
			for (mapping of mappings) {
				if (mapping.private.port == this.privatePort) {
					cb(null, mapping)
					return
				}
			}
			cb(null, null)
		} else {
			cb(err, null)
		}
	})
}

Server.prototype.setMappingTimeout = function(seconds) {
	if (this.timer) {
		clearTimeout(this.timer)
	}
	if (typeof(seconds) == 'number') {
	console.log('Refreshing mapping in '+seconds+'s')
		this.timer = setTimeout(() => { this.refreshMapping() }, seconds*1000)
	} else {
		this.timer = null
	}
}

Server.prototype.setPublicPort = function(port) {
	if (port != this.publicPort) {
		this.publicPort = port
		this.emit('public-address-changed')
		console.log('Updated public port to '+port)
	}
}

Server.prototype.setPublicIP = function(ip) {
	if (ip != this.publicIP) {
		this.publicIP = ip
		this.emit('public-address-changed')
		console.log('Updated public IP to '+ip)
	}
}

Server.prototype.refreshMapping = function() {
	if (!this.running) {
		return
	}

	console.log('Refreshing mapping')
	this.getMapping((err, mapping) => {
		if (mapping) {
			console.log('Existing mapping valid for another '+mapping.ttl+'s')
			this.setMappingTimeoutingAfter(mapping.ttl+1)
		} else {
			console.log('Creating mapping')
			this.upnp.portMapping({public: this.privatePort, private: this.privatePort, ttl: this.ttl}, (err) => {
				console.log('Checking new mapping')
				this.getMapping((err,mapping) => {
					if (mapping) {
						console.log('New mapping '+[this.publicIP,mapping.public.port].join(':')+' -> '+[mapping.private.host,mapping.private.port].join(':'))
						this.setPublicPort(mapping.public.port)
						this.setMappingTimeout(mapping.ttl+1)
					} else {
						this.setPublicPort(null)
						this.setMappingTimeout(60)
						console.log('Failed to create mapping, retrying in 60s')
					}
				})
			})
		}
	})
}
