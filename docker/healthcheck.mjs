// License: see repository LICENSE (NapCat Limited Redistribution License).
// Maintainer: kadidalax.
import { connect } from 'node:net';
const socket = connect({ host: '127.0.0.1', port: 6099 });
socket.setTimeout(3000);
socket.once('connect', () => { socket.destroy(); process.exit(0); });
socket.once('timeout', () => { socket.destroy(); process.exit(1); });
socket.once('error', () => { process.exit(1); });
