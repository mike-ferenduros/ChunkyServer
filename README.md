# ChunkyServer
This is an OPDS comic server specifically for ChunkyTNG, a yet-to-be-released iOS comic reader.
It wants to be easy to set up, easy to use, and secure.

It dynamically serves comic files (cbz, zip, cbr, rar, epub, pdf) from the folders you specify in the UI.
Only authorised clients are allowed access. In order to give a client access, you need to select 'Add Client' which will pop up a QR code. The client scans this and communicates with the server to claim the code.
If you close the QR code window before a client claims it, it becomes invalid. Only one client can claim a QR code.

## Networking
ChunkyServer will try to get past your router and be internet-accessible using UPNP. If this fails or your router doesn't support it, you can do the port-forwarding manually, or else use it as a LAN-only server.
It will keep track of it's current private and public address, and keep this address info in iCloud (via another server, facetube.fish:20051) for the client to retrieve.
If all this is working as it should, the client should always have access to a running server, regardless of IP changes.
However, if ChunkyServer can't reach the internet to send address updates, the client will not know how to reach ChunkyServer, _even via LAN_. In this situation, the only remedy is to re-scan a new QR code which will update the client with new address info.

## Security
All traffic is via TLS, using a self-signed certificate that ChunkyServer generates on first-run.
The SSL cert public key fingerprint is included in the client signup QR code, which the client uses to hard-pin the certificate.

## Standalone usage
This is probably not useful as a general-purpose OPDS comic server; the IP tracking is necessarily ChunkyTNG-specific, and it serves everything with a self-signed SSL certificate which most clients will refuse to accept without extra work.
