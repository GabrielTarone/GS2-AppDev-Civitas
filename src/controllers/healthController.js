const mongoose = require('mongoose');

async function getHealth(_req, res) {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      return res.status(503).json({ status: 'offline' });
    }
    await mongoose.connection.db.command({ ping: 1 });
    return res.status(200).json({ status: 'online' });
  } catch {
    return res.status(503).json({ status: 'offline' });
  }
}

module.exports = { getHealth };
