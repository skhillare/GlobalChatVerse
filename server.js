const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Queues by country code; 'any' for global
const queues = {}; // { countryCode: socket }

function enqueue(socket, country) {
  const key = country || 'any';
  if (!queues[key]) queues[key] = null;
  if (queues[key] && queues[key].connected && queues[key] !== socket) {
    const other = queues[key];
    queues[key] = null;
    pair(socket, other);
  } else {
    queues[key] = socket;
    socket.emit('status', { state: 'waiting' });
  }
}

function pair(a, b) {
  a.partner = b;
  b.partner = a;
  a.emit('status', { state: 'paired' });
  b.emit('status', { state: 'paired' });
  // Share basic partner info
  a.emit('partnerInfo', b.data || null);
  b.emit('partnerInfo', a.data || null);
}

io.on('connection', (socket) => {
  socket.data = null;
  socket.partner = null;

  socket.on('join', (info) => {
    // info: { country, name, flag }
    socket.data = info || null;
  });

  socket.on('start', (pref) => {
    const country = pref && pref.country ? pref.country : (socket.data && socket.data.country) ? socket.data.country : 'any';
    enqueue(socket, country);
  });

  socket.on('next', () => {
    if (socket.partner) {
      socket.partner.emit('status', { state: 'partner-left' });
      socket.partner.partner = null;
      socket.partner = null;
    }
    const country = (socket.data && socket.data.country) ? socket.data.country : 'any';
    enqueue(socket, country);
  });

  socket.on('signal', (payload) => {
    if (socket.partner) socket.partner.emit('signal', payload);
  });

  socket.on('chatMessage', (msg) => {
    if (socket.partner) socket.partner.emit('chatMessage', msg);
  });

  socket.on('disconnect', () => {
    // remove from queues if present
    for (const k of Object.keys(queues)) {
      if (queues[k] === socket) queues[k] = null;
    }
    if (socket.partner) {
      socket.partner.emit('status', { state: 'partner-left' });
      socket.partner.partner = null;
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));