const forge = require('node-forge')
const pki = forge.pki

module.exports = {
	genCert: function() {
		console.log('Generating 2048 bit key')
		const keys = pki.rsa.generateKeyPair(2048)
		const cert = pki.createCertificate()
		cert.publicKey = keys.publicKey
		cert.serialNumber = '01'
		cert.sign(keys.privateKey)

		return {
			cert: pki.certificateToPem(cert),
			key: pki.privateKeyToPem(keys.privateKey),
			publicKey: pki.publicKeyToPem(keys.publicKey),
			fingerprint: pki.getPublicKeyFingerprint(keys.publicKey, {encoding:'hex'}),
		}
	}
}